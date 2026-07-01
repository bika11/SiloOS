#!/bin/bash

# SiloOS - Automated System Installer
# Purpose: Rebuild the entire SiloOS environment from a fresh Raspberry Pi OS (Lite)

set -e

echo "?? SiloOS Installer Starting..."

# 1. Update System
echo "?? Updating packages..."
sudo DEBIAN_FRONTEND=noninteractive apt-get update && sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y

# 2. Install Hardware Dependencies
echo "?? Installing system dependencies (BlueZ, Python, Serial)..."
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y bluez python3 python3-pip python3-venv libdbus-1-dev libglib2.0-dev

# 3. Setup Python Environment
echo "?? Configuring Python environment..."
# Using --break-system-packages to allow installation on modern Pi OS (dedicated device)
if [ -f requirements.txt ]; then
    pip3 install --user -r requirements.txt --break-system-packages
else
    pip3 install --user bleak aiohttp websockets pyserial dbus-next bluez-peripheral --break-system-packages
fi

# 4. Bluetooth Permissions
echo "?? Configuring Bluetooth permissions..."
sudo usermod -aG bluetooth $USER
sudo usermod -aG dialout $USER

# 5. Create Configuration Template
if [ ! -f config.json ]; then
    echo "?? Creating default config.json..."

    # Generate a secure random token for authentication
    SECURE_TOKEN=$(cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 32 | head -n 1)

    # Copy from template and replace token placeholder if template exists
    if [ -f config.example.json ]; then
        sed "s/your-secure-token-here/$SECURE_TOKEN/" config.example.json > config.json
    else
        cat <<EOF > config.json
{
  "topbrewer_mac": "88:6B:0F:BC:00:A1",
  "laumas_port": "/dev/ttyUSB0",
  "laumas_baud": 115200,
  "ws_port": 8765,
  "auth_token": "$SECURE_TOKEN",
  "settings": {
    "theme": "dark",
    "hidden_recipes": []
  }
}
EOF
    fi
fi

# Generate dashboard/.env if it doesn't exist
if [ ! -f dashboard/.env ]; then
    echo "?? Generating frontend .env file..."
    # Extract token from config.json
    SECURE_TOKEN=$(grep -oP '"auth_token"\s*:\s*"\K[^"]+' config.json)

    # Failsafe if not found
    if [ -z "$SECURE_TOKEN" ] || [ "$SECURE_TOKEN" = "your-secure-token-here" ]; then
        SECURE_TOKEN=$(cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 32 | head -n 1)
    fi
    echo "VITE_WS_AUTH_TOKEN=$SECURE_TOKEN" > dashboard/.env
fi

# 6. Install Node.js Dependencies (Dashboard)
echo "?? Checking Dashboard dependencies..."
if [ -d "dashboard" ]; then
    cd dashboard
    if [ ! -d "node_modules" ]; then
        echo "?? node_modules missing. Installing..."
        npm install
    fi
    cd ..
fi

# 7. Install Systemd Services
echo "?? Installing systemd services..."

# Scale Bridge Service
sudo bash -c "cat <<EOF > /etc/systemd/system/silo-bridge.service
[Unit]
Description=SiloOS Scale & BLE Bridge
After=network.target bluetooth.target
StartLimitIntervalSec=0

[Service]
Type=simple
User=$USER
WorkingDirectory=$(pwd)
ExecStart=/usr/bin/python3 $(pwd)/ble_bridge.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF"

# Dashboard Service
sudo bash -c "cat <<EOF > /etc/systemd/system/silo-dashboard.service
[Unit]
Description=SiloOS Dashboard PWA
After=network.target
StartLimitIntervalSec=0

[Service]
Type=simple
User=$USER
WorkingDirectory=$(pwd)/dashboard
ExecStart=/usr/bin/npm run dev -- --host --port 5173
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF"

sudo systemctl daemon-reload

# Enable and Start
echo "?? Activating services..."
sudo systemctl enable silo-bridge
sudo systemctl enable silo-dashboard
sudo systemctl restart silo-bridge
sudo systemctl restart silo-dashboard

# Cleanup old service name if it exists
if systemctl is-active --quiet scale_bridge; then
    sudo systemctl stop scale_bridge
    sudo systemctl disable scale_bridge
fi

echo "?? Installation Complete!"
echo "?? Services are now running and set to start on boot."
echo "?? Dashboard: http://$(hostname -I | awk '{print $1}'):5173"
echo "?? Bridge: Port 8765"
