#!/usr/bin/env python3
"""
Read-only Laumas scale register diagnostic (Phase 0b).

The Laumas transmitter streams Modbus-RTU "read holding registers" *responses*
continuously (the production bridge never issues a request — it just listens).
Each frame is:

    [0]=0x01 slave  [1]=0x03 func  [2]=0x0A bytecount(10)
    [3..12] = 5 registers x 2 bytes (big-endian per register)
    [13]=CRC_lo  [14]=CRC_hi   (Modbus RTU CRC16, little-endian on the wire)

`ble_bridge.py` today reads ONLY bytes 11..12 (the 5th register) and divides by
10, with no CRC check. This tool dumps ALL five registers decoded several ways so
we can confirm which register carries the weight and the true scaling BEFORE we
touch the parser.

READ-ONLY: this only listens on the serial line. It never writes to the bus.

Run on the Pi:  python3 tools/scale_registers.py [--frames N] [--port DEV] [--baud N]
"""

import argparse
import sys

# Production serial parameters (must match ble_bridge.py read_serial_loop)
DEFAULT_PORT = "/dev/serial/by-id/usb-FTDI_USB-RS485_Cable_AV0M0GZK-if00-port0"
DEFAULT_BAUD = 115200

FRAME_LEN = 15
HDR = (0x01, 0x03, 0x0A)


def crc16_modbus(data: bytes) -> int:
    """Standard Modbus RTU CRC16 (poly 0xA001). Returns the 16-bit CRC."""
    crc = 0xFFFF
    for byte in data:
        crc ^= byte
        for _ in range(8):
            if crc & 1:
                crc = (crc >> 1) ^ 0xA001
            else:
                crc >>= 1
    return crc & 0xFFFF


def decode_frame(frame: bytes) -> None:
    """Print every plausible interpretation of one 15-byte frame."""
    hex_str = " ".join(f"{b:02X}" for b in frame)
    print(f"\nFRAME: {hex_str}")

    # CRC check — CRC is over bytes [0..12], transmitted little-endian at [13],[14]
    calc = crc16_modbus(frame[:13])
    on_wire = frame[13] | (frame[14] << 8)
    crc_ok = calc == on_wire
    print(f"  CRC16: on-wire=0x{on_wire:04X} calc=0x{calc:04X} -> {'OK' if crc_ok else 'MISMATCH'}")

    data = frame[3:13]  # 10 data bytes = registers 0..4
    regs = [(data[2 * n] << 8) | data[2 * n + 1] for n in range(5)]
    print("  Registers (uint16 BE):  " + "  ".join(f"R{n}={regs[n]}" for n in range(5)))
    print(f"  *** ble_bridge.py currently reads R4={regs[4]}  -> /10 = {regs[4] / 10.0} ***")

    # Candidate divisors on the single register the code uses today
    print("  R4 scaled:  " + "  ".join(f"/{d}={regs[4] / d:.4f}" for d in (1, 10, 100, 1000)))

    # 32-bit combinations across adjacent register pairs, both endiannesses
    for hi, lo, label in ((0, 1, "R0:R1"), (1, 2, "R1:R2"), (3, 4, "R3:R4")):
        be = (regs[hi] << 16) | regs[lo]
        le = (regs[lo] << 16) | regs[hi]
        print(f"  32-bit {label}:  word-BE={be} (/10={be/10.0})   word-LE={le} (/10={le/10.0})")


def main() -> int:
    ap = argparse.ArgumentParser(description="Read-only Laumas register dump")
    ap.add_argument("--frames", type=int, default=15, help="how many valid frames to dump")
    ap.add_argument("--port", default=DEFAULT_PORT)
    ap.add_argument("--baud", type=int, default=DEFAULT_BAUD)
    args = ap.parse_args()

    try:
        import serial  # pyserial — present on the Pi
    except ImportError:
        print("pyserial not installed. Run this on the Pi: pip install pyserial", file=sys.stderr)
        return 2

    try:
        ser = serial.Serial(args.port, args.baud, parity=serial.PARITY_EVEN,
                            stopbits=1, timeout=0.1)
    except Exception as e:
        print(f"Could not open {args.port}: {e}", file=sys.stderr)
        print("(This tool is meant to run on the Pi with the RS485 cable attached.)", file=sys.stderr)
        return 2

    print(f"Listening on {args.port} @ {args.baud} 8E1 (read-only). "
          f"Dumping {args.frames} frames...")
    buffer = bytearray()
    dumped = 0
    bad_crc = 0
    try:
        while dumped < args.frames:
            chunk = ser.read(100)
            if chunk:
                buffer.extend(chunk)
                i = 0
                while i <= len(buffer) - FRAME_LEN:
                    if (buffer[i], buffer[i + 1], buffer[i + 2]) == HDR:
                        frame = bytes(buffer[i:i + FRAME_LEN])
                        decode_frame(frame)
                        if crc16_modbus(frame[:13]) != (frame[13] | (frame[14] << 8)):
                            bad_crc += 1
                        dumped += 1
                        del buffer[:i + FRAME_LEN]
                        i = 0
                        if dumped >= args.frames:
                            break
                        continue
                    i += 1
                if len(buffer) > 300:
                    del buffer[:100]
    except KeyboardInterrupt:
        pass
    finally:
        ser.close()

    print(f"\nDone. Dumped {dumped} frames, {bad_crc} with bad CRC.")
    print("Interpretation notes:")
    print("  - Whichever decode yields a stable, physically-plausible weight (kg) is the real one.")
    print("  - If R4/10 already tracks the load correctly and stays < 6553.5 for your doses,")
    print("    the current parser is reading the right register — keep it and just add CRC/range/debounce.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
