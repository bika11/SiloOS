#!/bin/bash
# Convert ble_bridge.py from potentially corrupted encoding to clean UTF-8
# Use Python internally to handle the conversion safely
python3 -c "
import os
try:
    with open('/home/siloos/ble_bridge.py', 'rb') as f:
        raw = f.read()
    
    # Try UTF-16 first (the source of the error)
    try:
        content = raw.decode('utf-16')
        print('Detected UTF-16, converting...')
    except:
        # Fallback to UTF-8
        content = raw.decode('utf-8', errors='replace')
        print('Detected non-UTF16, cleaning...')
    
    with open('/home/siloos/ble_bridge.py', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Encoding fix complete.')
except Exception as e:
    print(f'Fix failed: {e}')
"
