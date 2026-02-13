import asyncio
from bleak import BleakScanner

async def run():
    print("SiloOS: Scanning for TopBrewer machines...")
    devices = await BleakScanner.discover()
    found = False
    for d in devices:
        name = d.name if d.name else "Unknown"
        if "TopBrewer" in name or "Scanomat" in name:
            print(f"?? FOUND: {name} | Address: {d.address} | RSSI: {d.rssi}")
            found = True
        else:
            # Verbose log for all devices to help debug
            print(f"   Seen: {name} ({d.address})")
            
    if not found:
        print("?? No TopBrewer found in range of the Raspberry Pi.")

if __name__ == "__main__":
    asyncio.run(run())
