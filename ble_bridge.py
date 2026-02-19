import asyncio
import json
import logging
import serial
from aiohttp import web
from bluez_peripheral.gatt.service import Service
from bluez_peripheral.gatt.characteristic import characteristic, CharacteristicFlags as CharFlags
from bluez_peripheral.util import get_message_bus, Adapter
from bluez_peripheral.advert import Advertisement
from bleak import BleakClient, BleakScanner
import binascii
import subprocess # For hard resets

# --- LOGGING SETUP ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("SiloOS")
# logger.setLevel(logging.DEBUG) # Uncomment for deep BLE troubleshooting

# --- CONFIGURATION & SETTINGS HANDLER ---
class Config:
    def __init__(self, path="/home/siloos/config.json"):
        self.path = path
        self.data = {
            "laumas_port": "/dev/ttyUSB0",
            "laumas_baud": 115200,
            "ws_port": 8765,
            "topbrewer_mac": "88:6B:0F:BC:00:A1",
            "auth_token": "silo-secret",
            "tare_offset": 0.0,
            "settings": {
                "theme": "dark",
                "hidden_recipes": []
            },
            "preferences": {}, # Drink-specific tweaks (vol, intensity)
            "profiles": {}     # Learned silo flow rates/delays
        }
        self.load()

    def load(self):
        try:
            with open(self.path, "r") as f:
                loaded = json.load(f)
                # Clean keys and merge dictionaries
                for k, v in loaded.items():
                    k_clean = k.strip().lower()
                    if k_clean in ["settings", "preferences", "profiles"] and isinstance(v, dict):
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

# --- BOOKOO PROTOCOL CONSTANTS ---
SERVICE_UUID = "00000ffe-0000-1000-8000-00805f9b34fb"
WEIGHT_UUID  = "0000ff11-0000-1000-8000-00805f9b34fb"
CMD_UUID     = "0000ff12-0000-1000-8000-00805f9b34fb"

class BookooService(Service):
    def __init__(self):
        super().__init__(SERVICE_UUID, primary=True)

    @characteristic(WEIGHT_UUID, CharFlags.READ | CharFlags.NOTIFY)
    def weight_measurement(self, options):
        return bytes([0x03, 0x0B] + [0x00]*18)

    @characteristic(CMD_UUID, CharFlags.WRITE | CharFlags.WRITE_WITHOUT_RESPONSE)
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
    global tare_offset
    # Security Check: Auth Token in Query Param
    client_token = request.query.get("auth")
    if AUTH_TOKEN and client_token != AUTH_TOKEN:
        logger.warning(f"Connection Refused: Invalid Auth Token from {request.remote}")
        return web.Response(status=401, text="Unauthorized")

    ws = web.WebSocketResponse()
    await ws.prepare(request)
    connected_websockets.add(ws)
    logger.info(f"New WebSocket Client Connected from {request.remote}")
    try:
        # Sync current state to new client
        await ws.send_str(json.dumps({
            "type": "sync",
            "weight": current_weight,
            "tare_offset": tare_offset,
            "settings": config.settings,
            "preferences": config.preferences,
            "profiles": config.profiles
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
                        tare_offset = current_weight
                        config.data["tare_offset"] = tare_offset
                        config.save()
                        logger.info(f"Tare set to {tare_offset}g (Saved to Pi)")
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
                        config.data["preferences"].update(data.get("preferences", {}))
                        config.save()
                        await broadcast_relay({"type": "preferences_update", "preferences": config.preferences})

                    elif data.get("type") == "update_profiles":
                        config.data["profiles"].update(data.get("profiles", {}))
                        config.save()
                        await broadcast_relay({"type": "profiles_update", "profiles": config.profiles})

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

                except Exception as e:
                    logger.error(f"PWA Msg Error: {e}")
    finally:
        connected_websockets.discard(ws)
        logger.info("WebSocket Client Disconnected")
    return ws

async def broadcast_websocket(weight):
    await broadcast_relay({"weight": weight, "net": weight - tare_offset})

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
    await service.register(bus, adapter=adapter)
    
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
    site = web.TCPSite(runner, '0.0.0.0', WS_PORT)
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
                                        logger.info(f"?? Scale Weight Update: {current_weight}g")
                                        loop.call_soon_threadsafe(service.get_characteristic(WEIGHT_UUID).changed, packet)
                                    except: pass
                                    loop.call_soon_threadsafe(lambda w=current_weight: asyncio.create_task(broadcast_websocket(w)))
                                del buffer[:i+15]
                                i = 0
                                continue
                            i += 1
                        if len(buffer) > 300: del buffer[:100]
            except Exception as e:
                logger.error(f"Serial Error: {e}")
                import time
                time.sleep(5)

    await loop.run_in_executor(None, read_serial_loop)
    await asyncio.get_running_loop().create_future()

if __name__ == "__main__":
    asyncio.run(main())
