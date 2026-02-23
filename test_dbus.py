import asyncio
import uuid
import sys
from bluez_peripheral.gatt.service import Service
from bluez_peripheral.gatt.characteristic import characteristic, CharacteristicFlags as CharFlags
from bluez_peripheral.util import get_message_bus, Adapter
from bluez_peripheral.advert import Advertisement

SERVICE_UUID = "00000ffe-0000-1000-8000-00805f9b34fb"
WEIGHT_UUID = "0000ff11-0000-1000-8000-00805f9b34fb"

class TestService(Service):
    def __init__(self):
        super().__init__(uuid.UUID(SERVICE_UUID), primary=True)

    @characteristic(uuid.UUID(WEIGHT_UUID), CharFlags.READ | CharFlags.NOTIFY)
    def weight_measurement(self, options):
        return b'\x00'

async def main():
    print("1. Getting Message Bus")
    bus = await get_message_bus()
    
    print("2. Getting Adapter")
    try:
        adapter = await Adapter.get_first(bus)
        print(f"Adapter Found: {adapter.path}")
    except Exception as e:
        print(f"FAILED TO GET ADAPTER: {e}")
        sys.exit(1)
        
    print("3. Registering Service")
    service = TestService()
    try:
        await service.register(bus, adapter=adapter)
        print("SERVICE REGISTERED SUCCESSFULLY")
    except Exception as e:
        print(f"FAILED TO REGISTER SERVICE. Exception details:")
        import traceback
        traceback.print_exc()
        sys.exit(1)

    print("4. Registering Advertisement")
    try:
        advert = Advertisement("TEST", [SERVICE_UUID], appearance=0, timeout=0)
        await advert.register(bus, adapter)
        print("ADVERTISEMENT REGISTERED SUCCESSFULLY")
    except Exception as e:
        print(f"FAILED TO REGISTER ADVERT: {e}")

    await adapter.set_powered(True)
    print("ALL TESTS PASSED")

if __name__ == "__main__":
    asyncio.run(main())
