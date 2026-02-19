#!/bin/bash

# SiloOS Health Check Tool
# Used to verify system integrity after deployment.

BOLD='\033[1m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BOLD}--- SiloOS System Health Check ---${NC}"

# 1. Check Services
echo -n "Checking silo-bridge service... "
if systemctl is-active --quiet silo-bridge; then
    echo -e "${GREEN}ACTIVE${NC}"
else
    echo -e "${RED}INACTIVE${NC}"
fi

echo -n "Checking silo-dashboard service... "
if systemctl is-active --quiet silo-dashboard; then
    echo -e "${GREEN}ACTIVE${NC}"
else
    echo -e "${RED}INACTIVE${NC}"
fi

# 2. Audit Dashboard Logs for Vite/CSS Errors
echo -n "Auditing Dashboard logs since last restart... "
VITE_ERRORS=$(journalctl -u silo-dashboard --since "5 minutes ago" | grep -E "ENOENT|postcss|plugin:vite:css")
if [ -z "$VITE_ERRORS" ]; then
    echo -e "${GREEN}CLEAN${NC}"
else
    echo -e "${RED}RECENT ERRORS DETECTED${NC}"
    echo -e "${YELLOW}$VITE_ERRORS${NC}" | head -n 5
fi

# 3. Check Bridge Logs for Hardware Connection
echo -n "Checking Bridge hardware links... "
WEIGHT_SAMPLES=$(journalctl -u silo-bridge -n 200 | grep "Scale Weight Update")
TOPBREWER_LINK=$(journalctl -u silo-bridge -n 200 | grep "Attempting.*TopBrewer")

if [ -n "$WEIGHT_SAMPLES" ] && [ -n "$TOPBREWER_LINK" ]; then
    echo -e "${GREEN}CONNECTED${NC}"
else
    echo -e "${RED}HARDWARE LINK MISSING${NC}"
    [ -z "$WEIGHT_SAMPLES" ] && echo -e "${YELLOW}  - No weight updates found in recent logs${NC}"
    [ -z "$TOPBREWER_LINK" ] && echo -e "${YELLOW}  - No TopBrewer connection attempts found${NC}"
fi

echo -e "${BOLD}--- Check Complete ---${NC}"
