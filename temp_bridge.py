import asyncio
import serial
import struct
import json
import logging
from aiohttp import web
from bluez_peripheral.gatt.service import Service
from bluez_peripheral.gatt.characteristic import characteristic, CharacteristicFlags as CharFlags
from bluez_peripheral.util import get_message_bus, Adapter
from bluez_peripheral.advert import Advertisement

# --- CONFIGURATION ---
LAUMAS_PORT = '/dev/ttyUSB0'
LAUMAS_BAUD = 115200
WS_PORT = 8765

# --- LOGGING SETUP ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("SiloOS")

# --- GLOBAL STATE ---
raw_weight = 0.0
tare_offset = 0.0
current_weight = 0.0
connected_websockets = set()

# --- BOOKOO PROTOCOL CONSTANTS ---
SERVICE_UUID = "00000ffe-0000-1000-8000-00805f9b34fb"
WEIGHT_UUID  = "0000ff11-0000-1000-8000-00805f9b34fb"
CMD_UUID  = "0000ff12-0000-1000-8000-00805f9b34fb"

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

async def websocket_handler(request):
    global tare_offset, raw_weight
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    connected_websockets.add(ws)
    logger.info("New WebSocket Client Connected")
    try:
        await ws.send_str(json.dumps({"weight": current_weight}))
        async for msg in ws:
            if msg.type == web.WSMsgType.TEXT:
                try:
                    data = json.loads(msg.data)
                    if data.get("command") == "tare":
                        tare_offset = raw_weight
                        logger.info(f"Software Tare Performed. Offset: {tare_offset}")
                        # Immediately broadcast 0.0
                        await broadcast_websocket(0.0)
                except Exception as e:
                    logger.error(f"WS Command Error: {e}")
    finally:
        connected_websockets.discard(ws)
        logger.info("WebSocket Client Disconnected")
    return ws

async def broadcast_websocket(weight):
    if not connected_websockets: return
    data = json.dumps({"weight": weight})
    for ws in set(connected_websockets):
        try:
            await ws.send_str(data)
        except Exception as e:
            logger.error(f"WS Broadcast Error: {e}")
            connected_websockets.discard(ws)

async def main():
    logger.info("?? Starting Bluetooth Service...")
    bus = await get_message_bus()
    
    adapter = None
    try:
        adapter = await Adapter.get_first(bus)
    except Exception as e:
        logger.warning(f"Could not find adapter automatically: {e}. Trying /org/bluez/hci0 manually.")
        try:
            introspection = await bus.introspect("org.bluez", "/org/bluez/hci0")
            proxy = bus.get_proxy_object("org.bluez", "/org/bluez/hci0", introspection)
            adapter = Adapter(proxy)
            logger.info("Successfully bound to /org/bluez/hci0 manually.")
        except Exception as e2:
            logger.error(f"Manual adapter fallback failed: {e2}")

    service = BookooService()
    await service.register(bus, adapter=adapter)
    
    try:
        advert = Advertisement("BOOKOO_PI", [SERVICE_UUID], appearance=0x0000, timeout=0)
        await advert.register(bus, adapter)
        # Force a power on check
        if adapter:
            await adapter.set_powered(True)
        logger.info("?? Bluetooth Advertising as 'BOOKOO_PI'")
    except Exception as e:
        logger.error(f"Bluetooth Advertising Error: {e}")

    logger.info(f"?? Starting WebSocket Server on port {WS_PORT}...")
    app = web.Application()
    app.router.add_get('/', websocket_handler)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, '0.0.0.0', WS_PORT)
    await site.start()

    logger.info("?? Connecting to Laumas Scale (Serial)...")
    loop = asyncio.get_running_loop()
    
    def read_serial_loop():
        global current_weight, raw_weight
        while True:
            try:
                ser = serial.Serial(LAUMAS_PORT, LAUMAS_BAUD, parity=serial.PARITY_EVEN, stopbits=1, timeout=0.05)
                buffer = bytearray()
                
                while True:
                    try:
                        chunk = ser.read(100)
                        if chunk:
                            buffer.extend(chunk)
                            found_packet = False
                            i = 0
                            while i <= len(buffer) - 15:
                                if buffer[i] == 0x01 and buffer[i+1] == 0x03 and buffer[i+2] == 0x0A:
                                    high_byte = buffer[i+11]
                                    low_byte  = buffer[i+12]
                                    raw_val   = (high_byte << 8) | low_byte
                                    new_raw_weight = float(raw_val) / 10.0
                                    
                                    raw_weight = new_raw_weight
                                    new_weight = raw_weight - tare_offset
                                    
                                    if abs(new_weight - current_weight) > 0.01 or new_weight == 0.0:
                                        logger.info(f"Weight Update: {new_weight} kg (Raw: {raw_weight} kg)")
                                        current_weight = new_weight
                                        packet = create_bookoo_packet(current_weight)
                                        try:
                                            loop.call_soon_threadsafe(service.get_characteristic(WEIGHT_UUID).changed, packet)
                                        except Exception as ble_e:
                                            logger.debug(f"BLE Notif Error: {ble_e}")
                                        
                                        loop.call_soon_threadsafe(lambda w=current_weight: asyncio.create_task(broadcast_websocket(w)))
                                    
                                    del buffer[:i+15]
                                    found_packet = True
                                    i = 0
                                    continue
                                i += 1
                            
                            if not found_packet and len(buffer) > 300:
                                del buffer[:100]
                                
                    except Exception as e:
                        logger.error(f"Serial Read Error: {e}")
                        break 
            except Exception as e:
                logger.error(f"Serial Connection Error: {e} - Retrying in 5s...")
                import time
                time.sleep(5)

    await loop.run_in_executor(None, read_serial_loop)
    await asyncio.get_running_loop().create_future()

if __name__ == "__main__":
    asyncio.run(main())
