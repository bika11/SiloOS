import asyncio
import json
import logging
import os
import time
import serial
from logging.handlers import RotatingFileHandler
from aiohttp import web
from bluez_peripheral.gatt.service import Service
from bluez_peripheral.gatt.characteristic import characteristic, CharacteristicFlags as CharFlags
from bluez_peripheral.util import get_message_bus, Adapter
from bluez_peripheral.advert import Advertisement
from bleak import BleakClient
import binascii
import subprocess # For hard resets
import uuid
from dose_controller import PiDoseController, set_audit_fn, send_cancel_to_topbrewer

# --- LOGGING SETUP ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("SiloOS")
# logger.setLevel(logging.DEBUG) # Uncomment for deep BLE troubleshooting

# --- AUDIT LOG SETUP (persistent, structured, file-based) ---
AUDIT_LOG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
os.makedirs(AUDIT_LOG_DIR, exist_ok=True)

audit_logger = logging.getLogger("SiloOS.audit")
audit_handler = RotatingFileHandler(
    os.path.join(AUDIT_LOG_DIR, "dispensing.log"),
    maxBytes=10 * 1024 * 1024,  # 10 MB per file
    backupCount=10               # Keep 100 MB total history
)
audit_handler.setFormatter(logging.Formatter('%(message)s'))
audit_logger.addHandler(audit_handler)
audit_logger.setLevel(logging.INFO)
audit_logger.propagate = False  # Don't duplicate to console

def audit(event_type, **kwargs):
    """Write a structured JSON audit event to persistent log file."""
    try:
        entry = {"ts": time.time(), "event": event_type, **kwargs}
        audit_logger.info(json.dumps(entry))
    except Exception:
        pass  # Audit must never crash the main process

# --- CONFIGURATION & SETTINGS HANDLER ---
class Config:
    def __init__(self, path="/home/siloos/config.json"):
        self.path = path
        self.data = {
            "laumas_port": "/dev/ttyUSB0",
            "laumas_baud": 115200,
            "ws_port": 8765,
            "topbrewer_mac": "88:6B:0F:BC:00:A1",
            "auth_token": "",
            "tare_offset": 0.0,
            "settings": {
                "theme": "dark",
                "hidden_recipes": []
            },
            "preferences": {}, # Drink-specific tweaks (vol, intensity)
            "profiles": {},     # Learned silo flow rates/delays
            "recipes": {}       # Custom sequential recipes
        }
        self.load()

    def load(self):
        try:
            with open(self.path, "r") as f:
                loaded = json.load(f)
                # Clean keys and merge dictionaries
                for k, v in loaded.items():
                    k_clean = k.strip().lower()
                    if k_clean in ["settings", "preferences", "profiles", "recipes"] and isinstance(v, dict):
                        self.data[k_clean].update(v)
                    else:
                        self.data[k_clean] = v.strip() if isinstance(v, str) else v
            logger.info(f"Loaded configuration from {self.path}")
        except Exception as e:
            logger.warning(f"Could not load {self.path} ({e}), using defaults")

    def save(self):
        try:
            with open(self.path, "w") as f:
                json.dump(self.data, f, indent=4)
            logger.info(f"Saved configuration to {self.path}")
        except Exception as e:
            logger.error(f"Failed to save configuration: {e}")

    def __getattr__(self, name):
        return self.data.get(name.lower())

config = Config()

# --- CONSTANTS ---
LAUMAS_PORT = config.laumas_port
LAUMAS_BAUD = config.laumas_baud
WS_PORT     = config.ws_port
TOPBREWER_MAC = config.topbrewer_mac
AUTH_TOKEN  = config.auth_token

# --- TOPBREWER UUIDS ---
TOPBREWER_SERVICE_UUID = "c0ffee00-2624-46ff-9311-4d7083160300"
SFWU_CHANNEL = "c0ffee00-2624-46ff-9311-4d7083160330"
BREW_STATUS  = "c0ffee00-2624-46ff-9311-4d7083160401"
DRINKS_MENU  = "c0ffee00-2624-46ff-9311-4d7083160201"

# --- GLOBAL STATE ---
current_weight = 0.0
tare_offset = float(config.tare_offset or 0.0)
connected_websockets = set()
topbrewer_client = None
active_doses = {}  # Per-silo dispensing tracker: siloId -> {start_time, start_weight, target_kg, client}
active_controller = None  # PiDoseController — one active dose at a time

# Bridge audit function to dose_controller module
set_audit_fn(audit)

# --- BOOKOO PROTOCOL CONSTANTS ---
SERVICE_UUID = "00000ffe-0000-1000-8000-00805f9b34fb"
WEIGHT_UUID  = "0000ff11-0000-1000-8000-00805f9b34fb"
CMD_UUID     = "0000ff12-0000-1000-8000-00805f9b34fb"

class BookooService(Service):
    def __init__(self):
        super().__init__(uuid.UUID(SERVICE_UUID), primary=True)

    @characteristic(uuid.UUID(WEIGHT_UUID), CharFlags.READ | CharFlags.NOTIFY)
    def weight_measurement(self, options):
        return bytes([0x03, 0x0B] + [0x00]*18)

    @characteristic(uuid.UUID(CMD_UUID), CharFlags.WRITE | CharFlags.WRITE_WITHOUT_RESPONSE)
    def command_input(self, options):
        pass

def create_bookoo_packet(weight_float):
    val = int(abs(weight_float) * 100)
    packet = bytearray(20)
    packet[0] = 0x03 
    packet[1] = 0x0B 
    packet[5] = 0x02 
    packet[6] = 0x2D if weight_float < 0 else 0x00 
    packet[7] = (val >> 16) & 0xFF
    packet[8] = (val >> 8)  & 0xFF
    packet[9] =  val        & 0xFF
    packet[13] = 100 
    checksum = 0
    for i in range(19): checksum ^= packet[i]
    packet[19] = checksum
    return bytes(packet)

async def broadcast_relay(msg_dict):
    if not connected_websockets: return
    data = json.dumps(msg_dict)
    for ws in set(connected_websockets):
        try:
            await ws.send_str(data)
        except Exception as e:
            connected_websockets.discard(ws)

async def websocket_handler(request):
    global tare_offset, active_controller
    # Security Check: Auth Token in Query Param
    client_token = request.query.get("auth")
    if AUTH_TOKEN and client_token != AUTH_TOKEN:
        logger.warning(f"Connection Refused: Invalid Auth Token from {request.remote}")
        return web.Response(status=401, text="Unauthorized")

    ws = web.WebSocketResponse()
    await ws.prepare(request)
    connected_websockets.add(ws)
    logger.info(f"New WebSocket Client Connected from {request.remote}")
    audit("ws_connect", client=str(request.remote), total_clients=len(connected_websockets))
    try:
        # Sync current state to new client
        await ws.send_str(json.dumps({
            "type": "sync",
            "weight": current_weight,
            "tare_offset": tare_offset,
            "settings": config.settings,
            "preferences": config.preferences,
            "profiles": config.profiles,
            "recipes": config.recipes
        }))
        
        # Send machine status
        is_machine_alive = False
        if topbrewer_client:
            try: is_machine_alive = bool(topbrewer_client.is_connected)
            except: pass
        await ws.send_str(json.dumps({"type": "status", "connected": is_machine_alive}))

        async for msg in ws:
            if msg.type == web.WSMsgType.TEXT:
                try:
                    data = json.loads(msg.data)
                    
                    # 1. Handle Remote Logging
                    if "log" in data:
                        le = data["log"]
                        print(f"\033[94m[PWA]\033[0m [\033[92m{le.get('levelName','INFO')}\033[0m] [\033[93m{le.get('tag','PWA')}\033[0m] {le.get('message','')}")
                    
                    # 2. Handle Tare Command
                    elif data.get("type") == "tare":
                        prev_tare = tare_offset
                        tare_offset = current_weight
                        config.data["tare_offset"] = tare_offset
                        config.save()
                        logger.info(f"Tare set to {tare_offset}g (was {prev_tare}g, saved to Pi)")
                        audit("tare", prev_offset=prev_tare, new_offset=tare_offset,
                              weight=current_weight, client=str(request.remote),
                              active_doses=list(active_doses.keys()))
                        await broadcast_relay({
                            "type": "tare_ack",
                            "offset": tare_offset
                        })

                    # 3. Handle Persistence Updates (Settings, Prefs, Profiles)
                    elif data.get("type") == "update_settings":
                        config.data["settings"].update(data.get("settings", {}))
                        config.save()
                        await broadcast_relay({"type": "settings_update", "settings": config.settings})

                    elif data.get("type") == "update_preferences":
                        config.data["preferences"] = data.get("preferences", {})
                        config.save()
                        await broadcast_relay({"type": "preferences_update", "preferences": config.preferences})

                    elif data.get("type") == "update_profiles":
                        config.data["profiles"] = data.get("profiles", {})
                        config.save()
                        await broadcast_relay({"type": "profiles_update", "profiles": config.profiles})

                    elif data.get("type") == "update_recipes":
                        config.data["recipes"] = data.get("recipes", {})
                        config.save()
                        await broadcast_relay({"type": "recipes_update", "recipes": config.recipes})

                    # 4. Handle Machine Commands (Relay to BLE)
                    elif data.get("type") == "write" and topbrewer_client:
                        uuid = data.get("uuid")
                        raw_hex = data.get("data")
                        payload = binascii.unhexlify(raw_hex)
                        await topbrewer_client.write_gatt_char(uuid, payload)
                        logger.debug(f"Relayed Write to {uuid}: {raw_hex}")
                    
                    elif data.get("type") == "read" and topbrewer_client:
                        uuid = data.get("uuid")
                        logger.info(f"Relayed READ Request for {uuid}")
                        val = await topbrewer_client.read_gatt_char(uuid)
                        await ws.send_str(json.dumps({
                            "type": "read_response",
                            "uuid": uuid,
                            "data": binascii.hexlify(val).decode()
                        }))

                    # 4. Pi-Authority Dose Control
                    elif data.get("type") == "dose_request":
                        silo_id = data.get("siloId", "unknown")
                        target_kg = data.get("targetKg", 0)

                        # Reject if another dose is already running
                        if active_controller and active_controller.state in ('armed', 'running', 'stopping', 'settling'):
                            audit("dose_rejected", silo_id=silo_id,
                                  reason="another dose active",
                                  active_silo=active_controller.silo_id,
                                  active_state=active_controller.state,
                                  client=str(request.remote))
                            await ws.send_str(json.dumps({
                                "type": "dose_rejected",
                                "siloId": silo_id,
                                "reason": f"Dose already active for '{active_controller.silo_id}'"
                            }))
                        else:
                            # Tare at current Pi weight (most accurate — no WebSocket latency)
                            tare_at = current_weight
                            loop = asyncio.get_running_loop()
                            active_controller = PiDoseController(
                                silo_id=silo_id,
                                target_kg=target_kg,
                                tare_weight=tare_at,
                                ble_client=topbrewer_client,
                                broadcast_fn=broadcast_relay,
                                loop=loop,
                            )
                            active_doses[silo_id] = {
                                "start_time": time.time(),
                                "start_weight": current_weight,
                                "target_kg": target_kg,
                                "client": str(request.remote),
                                "ws": ws,
                            }
                            # ACK back to requesting client AND broadcast to all
                            await broadcast_relay({
                                "type": "dose_ack",
                                "siloId": silo_id,
                                "tareG": tare_at,
                                "targetKg": target_kg,
                            })

                    elif data.get("type") == "dose_started":
                        # Dashboard confirms order was sent to machine → start the timer
                        silo_id = data.get("siloId", "unknown")
                        if active_controller and active_controller.silo_id == silo_id:
                            active_controller.start()
                        else:
                            audit("dose_started_orphan", silo_id=silo_id,
                                  client=str(request.remote))

                    elif data.get("type") == "dose_abort":
                        silo_id = data.get("siloId", "unknown")
                        reason = data.get("reason", "User aborted")
                        if active_controller and active_controller.silo_id == silo_id:
                            active_controller.abort(reason)
                            active_controller = None
                            active_doses.pop(silo_id, None)
                        else:
                            # No active Pi controller — send cancel directly as safety net
                            if topbrewer_client:
                                await send_cancel_to_topbrewer(topbrewer_client)
                            audit("dose_abort_direct", silo_id=silo_id,
                                  reason=reason, client=str(request.remote))

                except Exception as e:
                    logger.error(f"PWA Msg Error: {e}")
    finally:
        connected_websockets.discard(ws)
        logger.info("WebSocket Client Disconnected")
        audit("ws_disconnect", client=str(request.remote), total_clients=len(connected_websockets))
        
        # Safety Net: Abort active dose if controlling client disconnected
        if active_controller:
            silo_id = active_controller.silo_id
            dose_info = active_doses.get(silo_id)
            if dose_info and dose_info.get("ws") == ws:
                logger.warning(f"Active dose aborted because its controlling WebSocket client disconnected")
                active_controller.abort("WebSocket client disconnected")
                active_controller = None
                active_doses.pop(silo_id, None)
    return ws

async def broadcast_websocket(weight):
    await broadcast_relay({"weight": weight, "net": weight - tare_offset})

def _feed_dose_controller(weight):
    """Forward weight to active Pi dose controller. Called from serial thread via call_soon_threadsafe."""
    global active_controller
    if active_controller and active_controller.state in ('running', 'stopping', 'settling'):
        active_controller.on_weight(weight)
        # Clean up finished controllers
        if active_controller.state in ('done', 'aborted'):
            active_doses.pop(active_controller.silo_id, None)
            active_controller = None

def machine_notification_handler(characteristic, data):
    payload_hex = binascii.hexlify(data).decode()
    uuid = characteristic.uuid
    
    asyncio.create_task(broadcast_relay({
        "type": "notification",
        "uuid": uuid,
        "data": payload_hex
    }))

async def run_topbrewer_client():
    global topbrewer_client
    while True:
        try:
            # FORCED RESET: If previous attempt failed, clear the system-level connection
            # This is the "Automatic/Production Ready" way to clear DBus deadlocks
            try:
                logger.info(f"?? Forcing system-level disconnect for {TOPBREWER_MAC}...")
                subprocess.run(["bluetoothctl", "disconnect", TOPBREWER_MAC], 
                             capture_output=True, timeout=5)
            except: pass

            logger.info(f"?? Attempting direct connection to TopBrewer at {TOPBREWER_MAC}...")
            async with BleakClient(TOPBREWER_MAC, timeout=15.0) as client:
                topbrewer_client = client
                logger.info("?? Connected to TopBrewer via Pi Native BLE")
                
                # Broadcast status change immediately to all connected PWAs
                await broadcast_relay({"type": "status", "connected": True})

                await client.start_notify(SFWU_CHANNEL, machine_notification_handler)
                await client.start_notify(BREW_STATUS, machine_notification_handler)
                logger.info("?? Subscribed to SFWU and Brew Status")

                while client.is_connected:
                    await asyncio.sleep(2)
                
                logger.warning("?? TopBrewer disconnected from Pi")
                topbrewer_client = None
                await broadcast_relay({"type": "status", "connected": False})

        except Exception as e:
            logger.error(f"?? TopBrewer Client Error: {e}")
            topbrewer_client = None
            # Wait before retry to prevent log spamming
            await asyncio.sleep(5)

async def main():
    logger.info("?? Starting Bluetooth Scale Service...")
    bus = await get_message_bus()
    
    adapter = None
    try:
        adapter = await Adapter.get_first(bus)
    except Exception as e:
        logger.warning(f"Could not find adapter: {e}. Trying /org/bluez/hci0 manually.")
        try:
            introspection = await bus.introspect("org.bluez", "/org/bluez/hci0")
            proxy = bus.get_proxy_object("org.bluez", "/org/bluez/hci0", introspection)
            adapter = Adapter(proxy)
        except: pass

    service = BookooService()
    try:
        await service.register(bus, adapter=adapter)
        logger.info("?? Native BLE GATT Server Registered")
    except Exception as e:
        logger.error(f"?? Failed to register BLE GATT Service: {e}")
        logger.warning("?? Falling back to Cable/WebSocket Data Mode Only")

    try:
        advert = Advertisement("BOOKOO_PI", [SERVICE_UUID], appearance=0x0000, timeout=0)
        await advert.register(bus, adapter)
        if adapter: await adapter.set_powered(True)
        logger.info("?? Bluetooth Advertising as 'BOOKOO_PI'")
    except Exception as e:
        logger.error(f"Bluetooth Advertising Error: {e}")

    logger.info(f"?? Starting WebSocket Relay Server on port {WS_PORT}...")
    app = web.Application()
    app.router.add_get('/', websocket_handler)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, None, WS_PORT)
    await site.start()

    logger.info("?? Starting TopBrewer Client Link...")
    asyncio.create_task(run_topbrewer_client())

    logger.info("?? Connecting to Laumas Scale (Serial)...")
    loop = asyncio.get_running_loop()
    
    def read_serial_loop():
        global current_weight
        while True:
            try:
                ser = serial.Serial(LAUMAS_PORT, LAUMAS_BAUD, parity=serial.PARITY_EVEN, stopbits=1, timeout=0.05)
                audit("serial_connect", port=LAUMAS_PORT, baud=LAUMAS_BAUD)
                buffer = bytearray()
                while True:
                    chunk = ser.read(100)
                    if chunk:
                        buffer.extend(chunk)
                        i = 0
                        while i <= len(buffer) - 15:
                            if buffer[i] == 0x01 and buffer[i+1] == 0x03 and buffer[i+2] == 0x0A:
                                raw_val = (buffer[i+11] << 8) | buffer[i+12]
                                new_weight = float(raw_val) / 10.0
                                if abs(new_weight - current_weight) > 0.01:
                                    current_weight = new_weight
                                    packet = create_bookoo_packet(current_weight)
                                    try:
                                        logger.debug(f"⚖ Scale Weight Update: {current_weight}g")
                                        loop.call_soon_threadsafe(service.get_characteristic(WEIGHT_UUID).changed, packet)
                                    except Exception as ble_err:
                                        audit("ble_notify_error", error=str(ble_err), weight=current_weight)
                                    loop.call_soon_threadsafe(lambda w=current_weight: asyncio.create_task(broadcast_websocket(w)))
                                    # Feed weight to active Pi dose controller
                                    loop.call_soon_threadsafe(lambda w=current_weight: _feed_dose_controller(w))
                                del buffer[:i+15]
                                i = 0
                                continue
                            i += 1
                        if len(buffer) > 300:
                            audit("buffer_overflow", buffer_size=len(buffer), discarded=100)
                            del buffer[:100]
            except Exception as e:
                logger.error(f"Serial Error: {e}")
                audit("serial_error", error=str(e))
                time.sleep(5)

    await loop.run_in_executor(None, read_serial_loop)
    await asyncio.get_running_loop().create_future()

if __name__ == "__main__":
    asyncio.run(main())
