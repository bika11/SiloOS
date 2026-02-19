import serial
import sys

port = '/dev/ttyUSB0'
baud = 9600

def test_params(p, b, parity):
    try:
        s = serial.Serial(p, b, parity=parity, stopbits=1, timeout=0.05)
        print(f"SUCCESS: Opened {p} at {b} with parity={parity}, stopbits=1, timeout=0.05")
        s.close()
        return True
    except Exception as e:
        print(f"FAIL: {p} with parity={parity} -> {e}")
        return False

print("--- Serial Diagnostics ---")
test_params(port, baud, serial.PARITY_NONE)
test_params(port, baud, serial.PARITY_EVEN)
test_params(port, baud, serial.PARITY_ODD)
