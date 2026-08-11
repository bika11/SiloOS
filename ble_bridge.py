import asyncio
import json
import logging
import os
import time
import serial
from logging.handlers import RotatingFileHandler
from aiohttp import web
try:
    from bluez_peripheral.gatt.service import Service
    from bluez_peripheral.gatt.characteristic import characteristic, CharacteristicFlags as CharFlags
    from bluez_peripheral.util import get_message_bus, Adapter
    from bluez_peripheral.advert import Advertisement
    HAVE_BLUEZ = True
except Exception:
    HAVE_BLUEZ = False
    Service = object
    def characteristic(*args, **kwargs):
        def decorator(fn):
            return fn
        return decorator
    class CharFlags:
        READ = 1
        NOTIFY = 2
        WRITE = 4
        WRITE_WITHOUT_RESPONSE = 8

from bleak import BleakClient, BleakScanner
import binascii
import subprocess # For hard resets
import shutil # For cross-platform executable lookup (bluetoothctl)
import uuid
from dose_controller import (
    PiDoseController, set_audit_fn, send_cancel_to_topbrewer,
    save_profile as _save_profile, DEFAULT_PROFILE as _DEFAULT_PROFILE,
    PROFILES_FILE as _PROFILES_FILE,
)
import dose_history  # Console Phase 5: additive, isolated dose-history store

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
    def __init__(self, path=None):
        if path is None:
            local_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")
            if os.path.exists(local_path):
                self.path = local_path
            elif os.path.exists("/home/siloos/config.json"):
                self.path = "/home/siloos/config.json"
            else:
                self.path = local_path
        else:
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
                "hidden_recipes": [],
                # Console Phase 7 (C3) behaviour toggles — defaults preserve current behavior.
                "auto_topup": True,      # client re-requests the missing fraction on shortfall
                "hold_to_abort": True,   # E-stop needs a 2 s hold (vs immediate)
                "tare_every": True,      # settle + fresh baseline at each dose arm
                "verbose_audit": False   # DEBUG-level bridge logging
            },
            "preferences": {}, # Drink-specific tweaks (vol, intensity)
            "profiles": {},     # Learned silo flow rates/delays
            "recipes": {},      # Custom sequential recipes
            # Console Phase 7 (C1) tunable control constants — each default equals the
            # dose_controller constant, so an empty/absent block = original behavior.
            "control": {
                "settle_s": 2.0,
                "stall_time_s": 3.0,
                "stall_kg": 0.005,
                "scale_stale_s": 1.5,
                "debounce": 3,
                "backstop_mult": 1.5
            },
            "safety": {         # Absolute spill/overflow backstops (see Phase 1)
                "hopper_abort_kg": 130.0,  # hard abort if a dose reaches this weight
                "max_target_kg": 130.0,    # reject any dose_request above this
                "max_dispense_s": 600.0,   # absolute wall-clock ceiling per dose
                # Drop frames whose Modbus CRC16 fails. Confirmed safe via a live
                # register dump (0/8 frames bad CRC, standard Modbus RTU), so this
                # is ON. Set false in config.json only if the transmitter framing
                # ever changes and starts failing CRC.
                "enforce_scale_crc": True
            }
        }
        self.load()

    def load(self):
        try:
            with open(self.path, "r") as f:
                loaded = json.load(f)
                # Clean keys and merge dictionaries
                for k, v in loaded.items():
                    k_clean = k.strip().lower()
                    if k_clean in ["settings", "preferences", "profiles", "recipes", "safety", "control"] and isinstance(v, dict):
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
# Auth token precedence: SILOOS_AUTH_TOKEN env var (preferred — inject via systemd,
# never committed) > config.json auth_token > built-in 'silo-secret' dev default.
AUTH_TOKEN  = os.environ.get("SILOOS_AUTH_TOKEN") or config.auth_token

# --- SAFETY LIMITS (absolute spill/overflow backstops) ---
_SAFETY = config.data.get("safety", {})
HOPPER_ABORT_KG = float(_SAFETY.get("hopper_abort_kg", 130.0))
MAX_TARGET_KG   = float(_SAFETY.get("max_target_kg", 130.0))
MAX_DISPENSE_S  = float(_SAFETY.get("max_dispense_s", 600.0))
ENFORCE_SCALE_CRC = bool(_SAFETY.get("enforce_scale_crc", True))

# --- CONTROL CONSTANTS (Console Phase 7 C1) — tunable per config.json → control.
# Each default equals the dose_controller constant; passed into each new dose so
# the loop math is unchanged unless an operator overrides a value. ---
_CONTROL = config.data.get("control", {})
CTRL_SETTLE_S       = float(_CONTROL.get("settle_s", 2.0))
CTRL_STALL_TIME_S   = float(_CONTROL.get("stall_time_s", 3.0))
CTRL_STALL_KG       = float(_CONTROL.get("stall_kg", 0.005))
CTRL_SCALE_STALE_S  = float(_CONTROL.get("scale_stale_s", 1.5))
CTRL_DEBOUNCE       = int(_CONTROL.get("debounce", 3))
CTRL_BACKSTOP_MULT  = float(_CONTROL.get("backstop_mult", 1.5))


# --- CONSOLE PHASE 5 HELPERS (additive; do NOT alter the control loop) ---
def _control_params():
    """Current tunable control constants, passed into each new PiDoseController."""
    return {
        "settle_s": CTRL_SETTLE_S,
        "stall_time_s": CTRL_STALL_TIME_S,
        "stall_kg": CTRL_STALL_KG,
        "scale_stale_s": CTRL_SCALE_STALE_S,
        "debounce": CTRL_DEBOUNCE,
        "backstop_mult": CTRL_BACKSTOP_MULT,
    }


def _safety_public():
    """Current safety backstops + tunable control constants (merged), for the
    Console Precision section. Sent as the `safety` payload the client edits."""
    return {
        "hopper_abort_kg": HOPPER_ABORT_KG,
        "max_target_kg": MAX_TARGET_KG,
        "max_dispense_s": MAX_DISPENSE_S,
        "enforce_scale_crc": ENFORCE_SCALE_CRC,
        **_control_params(),
    }


def _learned_profiles():
    """Authoritative learned profiles (silo_profiles.json, written by the dose
    controller) translated to the camelCase the dashboard expects. This is the
    real source the loop uses — config.profiles is a separate legacy store."""
    out = {}
    try:
        with open(_PROFILES_FILE, "r") as f:
            raw = json.load(f)
        for silo, p in raw.items():
            out[silo] = {
                "flowRateKgPerS": p.get("flow_rate_kg_per_s", 0.0),
                "valveDelayS": p.get("valve_delay_s", 0.0),
                "overshootKg": p.get("overshoot_kg"),
                "totalDoses": p.get("total_doses", 0),
                "recentOvershootsKg": [],
            }
    except Exception:
        pass
    return out


def _bridge_stats():
    """Additive bridge telemetry for the Console Performance section. Read-only
    counters; the client computes uptime from startTs so no periodic push needed."""
    total = _frames_total
    dropped = _frames_dropped
    return {
        "startTs": _bridge_start_ts,
        "reconnects": max(0, _ble_connects - 1),
        "framesTotal": total,
        "framesDropped": dropped,
        "dropRatePct": round(100.0 * dropped / total, 3) if total else 0,
        "lastTareTs": _last_tare_ts,
        "tareOffset": tare_offset,
        "tareSeries": [t["offset"] for t in _tare_history][-20:],
    }


def _apply_verbose_audit():
    """C3: 'verbose_audit' toggles DEBUG-level bridge logging. No dosing effect."""
    verbose = bool(config.data.get("settings", {}).get("verbose_audit", False))
    logger.setLevel(logging.DEBUG if verbose else logging.INFO)


def _record_tare(offset):
    """Append a tare event for the drift/tare telemetry (additive)."""
    global _last_tare_ts
    _last_tare_ts = time.time()
    _tare_history.append({"ts": _last_tare_ts, "offset": offset})
    if len(_tare_history) > 50:
        del _tare_history[:len(_tare_history) - 50]


def update_safety_params(new: dict):
    """Validated, clamped update of the absolute safety backstops. Persists to
    config.json and updates the module globals so the NEXT dose uses them. Does
    NOT change the control-loop algorithm; callers refuse it while a dose is live."""
    global HOPPER_ABORT_KG, MAX_TARGET_KG, MAX_DISPENSE_S, ENFORCE_SCALE_CRC
    global CTRL_SETTLE_S, CTRL_STALL_TIME_S, CTRL_STALL_KG, CTRL_SCALE_STALE_S, CTRL_DEBOUNCE, CTRL_BACKSTOP_MULT

    def clamp(v, lo, hi, cur):
        try:
            v = float(v)
        except (TypeError, ValueError):
            return cur
        return max(lo, min(hi, v))

    # --- Absolute safety backstops ---
    if "hopper_abort_kg" in new:
        HOPPER_ABORT_KG = clamp(new["hopper_abort_kg"], 10.0, 300.0, HOPPER_ABORT_KG)
    if "max_target_kg" in new:
        MAX_TARGET_KG = clamp(new["max_target_kg"], 1.0, 300.0, MAX_TARGET_KG)
    if "max_dispense_s" in new:
        MAX_DISPENSE_S = clamp(new["max_dispense_s"], 30.0, 3600.0, MAX_DISPENSE_S)
    if "enforce_scale_crc" in new:
        ENFORCE_SCALE_CRC = bool(new["enforce_scale_crc"])

    # --- Tunable control constants (clamped to sane ranges; applied to NEXT dose) ---
    if "settle_s" in new:
        CTRL_SETTLE_S = clamp(new["settle_s"], 0.5, 10.0, CTRL_SETTLE_S)
    if "stall_time_s" in new:
        CTRL_STALL_TIME_S = clamp(new["stall_time_s"], 1.0, 15.0, CTRL_STALL_TIME_S)
    if "stall_kg" in new:
        CTRL_STALL_KG = clamp(new["stall_kg"], 0.001, 0.1, CTRL_STALL_KG)
    if "scale_stale_s" in new:
        CTRL_SCALE_STALE_S = clamp(new["scale_stale_s"], 0.5, 5.0, CTRL_SCALE_STALE_S)
    if "debounce" in new:
        CTRL_DEBOUNCE = int(clamp(new["debounce"], 1, 9, CTRL_DEBOUNCE))
    if "backstop_mult" in new:
        CTRL_BACKSTOP_MULT = clamp(new["backstop_mult"], 1.0, 3.0, CTRL_BACKSTOP_MULT)

    config.data["safety"] = {
        "hopper_abort_kg": HOPPER_ABORT_KG, "max_target_kg": MAX_TARGET_KG,
        "max_dispense_s": MAX_DISPENSE_S, "enforce_scale_crc": ENFORCE_SCALE_CRC,
    }
    config.data["control"] = _control_params()
    config.save()
    logger.info(f"Dose params updated: {_safety_public()}")


def _maybe_record_history(msg):
    """Record completed/aborted doses to the additive history store and push an
    update. Called for every broadcast; no-op unless it is a final dose_update."""
    try:
        if not isinstance(msg, dict) or msg.get("type") != "dose_update":
            return
        state = msg.get("state")
        if state == "done" and msg.get("result"):
            r = msg["result"]
            dose_history.record(
                silo=msg.get("siloId", "?"),
                target_kg=r.get("targetKg"), actual_kg=r.get("actualKg"),
                error_kg=r.get("overshootKg"), duration_ms=r.get("durationMs"),
                source="dose", aborted=False, lead_s=r.get("leadS"),
            )
            asyncio.ensure_future(broadcast_relay({
                "type": "dose_history_update",
                "history": dose_history.summary(),
                "learned_profiles": _learned_profiles(),
            }))
        elif state == "aborted":
            dose_history.record(silo=msg.get("siloId", "?"), aborted=True,
                                reason=msg.get("reason"))
            asyncio.ensure_future(broadcast_relay({
                "type": "dose_history_update",
                "history": dose_history.summary(),
            }))
    except Exception:
        pass  # history must NEVER affect dosing


# --- SCALE FRAME DECODING ---
SCALE_DIVISOR = 10.0             # raw uint16 -> kg (0.1 kg resolution); confirm with 0b
SCALE_MAX_PLAUSIBLE_KG = 300.0   # reject frames decoding above this (garbage / high word)


def crc16_modbus(data: bytes) -> int:
    """Modbus RTU CRC16 (poly 0xA001). Used to validate Laumas scale frames."""
    crc = 0xFFFF
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = (crc >> 1) ^ 0xA001 if (crc & 1) else (crc >> 1)
    return crc & 0xFFFF

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
pending_safety_cancel = False  # a dose was live when BLE dropped → cancel on reconnect
_last_overflow_cancel = 0.0  # monotonic time of last overflow-guard cancel (throttle)

# --- CONSOLE PHASE 7 (Batch B): additive bridge telemetry counters ---
_bridge_start_ts = time.time()  # process start (for uptime; client computes uptime = now - startTs)
_ble_connects = 0               # successful BLE connects (reconnects = connects - 1)
_frames_total = 0               # scale frames seen (good + dropped)
_frames_dropped = 0             # scale frames rejected (CRC/range)
_tare_history = []              # recent tare offsets: [{"ts":.., "offset":..}]
_last_tare_ts = 0.0

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
    _maybe_record_history(msg_dict)  # additive: capture final dose states (even with no clients)
    if not connected_websockets: return
    data = json.dumps(msg_dict)
    for ws in set(connected_websockets):
        try:
            await ws.send_str(data)
        except Exception as e:
            connected_websockets.discard(ws)

async def read_stable_weight(samples=5, tolerance=0.05, interval=0.08, timeout=2.5):
    """
    Return a settled weight: the median of `samples` consecutive readings that
    are all within `tolerance` kg of each other. Returns None if it cannot settle
    within `timeout` seconds (material still moving / vibration). Prevents a
    single vibrating sample from biasing the tare or a dose baseline.
    """
    window = []
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        window.append(current_weight)
        if len(window) > samples:
            window = window[-samples:]
        if len(window) == samples and (max(window) - min(window)) <= tolerance:
            return sorted(window)[len(window) // 2]
        await asyncio.sleep(interval)
    return None


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
            "recipes": config.recipes,
            # Console Phase 5 additions (additive keys; legacy clients ignore them):
            "learned_profiles": _learned_profiles(),
            "safety": _safety_public(),
            "dose_history": dose_history.summary(),
            "bridge_stats": _bridge_stats()
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
                    
                    # 2. Handle Tare Command — require a settled reading
                    elif data.get("type") == "tare":
                        settled = await read_stable_weight()
                        if settled is None:
                            audit("tare_unstable", weight=current_weight,
                                  client=str(request.remote))
                            await ws.send_str(json.dumps({
                                "type": "tare_rejected",
                                "reason": "Scale not settled — wait for it to stabilise and retry"
                            }))
                        else:
                            prev_tare = tare_offset
                            tare_offset = settled
                            config.data["tare_offset"] = tare_offset
                            config.save()
                            logger.info(f"Tare set to {tare_offset}g (was {prev_tare}g, saved to Pi)")
                            audit("tare", prev_offset=prev_tare, new_offset=tare_offset,
                                  weight=current_weight, client=str(request.remote),
                                  active_doses=list(active_doses.keys()))
                            _record_tare(tare_offset)
                            await broadcast_relay({
                                "type": "tare_ack",
                                "offset": tare_offset
                            })
                            await broadcast_relay({"type": "bridge_stats_update", "bridge_stats": _bridge_stats()})

                    # 3. Handle Persistence Updates (Settings, Prefs, Profiles)
                    elif data.get("type") == "update_settings":
                        config.data["settings"].update(data.get("settings", {}))
                        config.save()
                        _apply_verbose_audit()  # C3: reflect verbose_audit toggle live
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

                    # Console Phase 5: edit the absolute safety backstops. Refused
                    # while a dose is live; server-side clamps stay authoritative.
                    elif data.get("type") == "update_dose_params":
                        if active_controller and active_controller.state in ('armed', 'running', 'stopping', 'settling'):
                            await ws.send_str(json.dumps({
                                "type": "dose_params_rejected",
                                "reason": "A dose is active — stop it before changing safety limits"
                            }))
                        else:
                            update_safety_params(data.get("params", {}))
                            audit("dose_params_update", params=_safety_public(),
                                  client=str(request.remote))
                            await broadcast_relay({"type": "dose_params_update", "params": _safety_public()})

                    # Console Phase 5: reset a silo's LEARNED profile (silo_profiles.json
                    # — the real source the loop reads), not the legacy config.profiles.
                    elif data.get("type") == "relearn_silo":
                        silo_id = data.get("siloId")
                        if silo_id:
                            _save_profile(silo_id, dict(_DEFAULT_PROFILE))
                            audit("relearn_silo", silo_id=silo_id, client=str(request.remote))
                            await broadcast_relay({"type": "learned_profiles_update",
                                                   "learned_profiles": _learned_profiles()})

                    # Console Phase 7: client reports a scaled top-up correction (additive
                    # telemetry from the existing auto-top-up path; never affects control).
                    elif data.get("type") == "topup_event":
                        dose_history.record_topup(silo=data.get("siloId"),
                                                  shortfall_kg=data.get("shortfallKg"))
                        await broadcast_relay({"type": "dose_history_update",
                                               "history": dose_history.summary()})

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
                        order_id = data.get("orderId")  # unique per-dose id for client routing

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
                                "orderId": order_id,
                                "reason": f"Dose already active for '{active_controller.silo_id}'"
                            }))
                        # Reject implausible / dangerous targets (server-side guard,
                        # independent of any UI slider cap) — prevents overflow.
                        elif not isinstance(target_kg, (int, float)) or target_kg <= 0 or target_kg > MAX_TARGET_KG:
                            audit("dose_rejected", silo_id=silo_id,
                                  reason="target out of range",
                                  target_kg=target_kg, max_target_kg=MAX_TARGET_KG,
                                  client=str(request.remote))
                            await ws.send_str(json.dumps({
                                "type": "dose_rejected",
                                "siloId": silo_id,
                                "orderId": order_id,
                                "reason": f"Target {target_kg} kg out of range (0–{MAX_TARGET_KG:g} kg)"
                            }))
                        # Hopper-ready gate: refuse to dose on top of existing
                        # content that would overflow. NOTE: assumes the scale reads
                        # ~0 with an empty hopper (net beans). Confirm this reference
                        # before trusting it in production.
                        elif current_weight + target_kg > HOPPER_ABORT_KG:
                            audit("dose_rejected", silo_id=silo_id,
                                  reason="hopper too full",
                                  current_weight=current_weight, target_kg=target_kg,
                                  cap=HOPPER_ABORT_KG, client=str(request.remote))
                            await ws.send_str(json.dumps({
                                "type": "dose_rejected",
                                "siloId": silo_id,
                                "orderId": order_id,
                                "reason": f"Hopper too full ({current_weight:.1f} kg) — empty it before dosing {target_kg} kg"
                            }))
                        else:
                            # Settle the scale before capturing the dose baseline so a
                            # vibration doesn't bias the tare (garbage baseline -> wrong
                            # dispensed weight for the whole dose). C3: 'tare_every' off
                            # skips the settle gate and uses the current reading (faster
                            # arm, no stability check) — defaults ON = original behavior.
                            if config.data["settings"].get("tare_every", True):
                                tare_at = await read_stable_weight()
                            else:
                                tare_at = current_weight
                            if tare_at is None:
                                audit("dose_rejected", silo_id=silo_id,
                                      reason="scale not settled", weight=current_weight,
                                      client=str(request.remote))
                                await ws.send_str(json.dumps({
                                    "type": "dose_rejected",
                                    "siloId": silo_id,
                                    "orderId": order_id,
                                    "reason": "Scale not settled — wait for it to stabilise and retry"
                                }))
                            else:
                                loop = asyncio.get_running_loop()
                                active_controller = PiDoseController(
                                    silo_id=silo_id,
                                    target_kg=target_kg,
                                    tare_weight=tare_at,
                                    ble_client=topbrewer_client,
                                    broadcast_fn=broadcast_relay,
                                    loop=loop,
                                    max_dispense_s=MAX_DISPENSE_S,
                                    max_weight_kg=HOPPER_ABORT_KG,
                                    get_ble_client=lambda: topbrewer_client,
                                    order_id=order_id,
                                    control=_control_params(),
                                )
                                active_doses[silo_id] = {
                                    "start_time": time.time(),
                                    "start_weight": tare_at,
                                    "target_kg": target_kg,
                                    "client": str(request.remote),
                                    "ws": ws,
                                }
                                # ACK back to requesting client AND broadcast to all
                                await broadcast_relay({
                                    "type": "dose_ack",
                                    "siloId": silo_id,
                                    "orderId": order_id,
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
    """Forward weight to active Pi dose controller. Called on the event loop
    thread (via call_soon_threadsafe) for EVERY scale frame."""
    global active_controller, _last_overflow_cancel

    # --- ABSOLUTE OVERFLOW GUARD (defense-in-depth) ---
    # Independent of any dose controller: if the gross hopper weight reaches the
    # cap, command the machine to STOP no matter what is (or isn't) driving it.
    # This catches an uncontrolled dispense (e.g. a client that ignored a
    # dose_rejected) that would otherwise have no weight cutoff.
    if weight >= HOPPER_ABORT_KG:
        now = time.monotonic()
        if now - _last_overflow_cancel > 5.0:
            _last_overflow_cancel = now
            logger.error(f"OVERFLOW GUARD: hopper at {weight:.1f}kg (cap {HOPPER_ABORT_KG}) — cancelling machine")
            audit("overflow_guard", weight=weight, cap=HOPPER_ABORT_KG)
            if topbrewer_client:
                asyncio.ensure_future(send_cancel_to_topbrewer(topbrewer_client))
            asyncio.ensure_future(broadcast_relay({
                "type": "dose_error",
                "siloId": active_controller.silo_id if active_controller else "*",
                "error": f"OVERFLOW: hopper at {weight:.1f} kg — machine stopped",
            }))

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

def _handle_ble_drop_mid_dose():
    """
    Called when the machine BLE link drops. If a dose was live, we cannot send a
    cancel now (link is down), so mark it aborted (stops our timers, tells clients)
    and remember to hard-cancel the machine on reconnect — it may keep dispensing.
    """
    global active_controller, pending_safety_cancel
    if active_controller and active_controller.state in ('armed', 'running', 'stopping', 'settling'):
        logger.warning("TopBrewer BLE dropped mid-dose — aborting, will cancel on reconnect")
        audit("ble_drop_mid_dose", silo_id=active_controller.silo_id,
              state=active_controller.state)
        pending_safety_cancel = True
        active_controller.abort("TopBrewer BLE disconnected mid-dose")
        active_controller = None


async def run_topbrewer_client():
    global topbrewer_client, active_controller, pending_safety_cancel, _ble_connects
    while True:
        try:
            # FORCED RESET: On Linux, clear system-level bluetooth connection if needed.
            # Use shutil.which (cross-platform) — the old `where` is a Windows-only
            # command that throws FileNotFoundError on the Pi, which killed the
            # entire TopBrewer connect loop every 4 s (machine never connected).
            if shutil.which("bluetoothctl"):
                try:
                    subprocess.run(["bluetoothctl", "disconnect", TOPBREWER_MAC], capture_output=True, timeout=5)
                except: pass

            logger.info(f"Connecting to TopBrewer at {TOPBREWER_MAC}...")
            device = await BleakScanner.find_device_by_address(TOPBREWER_MAC, timeout=5.0)
            if not device:
                # Fallback search by exact MAC first, then Roastery
                devices = await BleakScanner.discover(timeout=4.0)
                for d in devices:
                    if d.address.upper() == TOPBREWER_MAC.upper():
                        device = d
                        break
                if not device:
                    for d in devices:
                        if d.name and "roastery" in d.name.lower():
                            device = d
                            break

            if not device:
                logger.warning(f"TopBrewer device '{TOPBREWER_MAC}' not found in scan, retrying in 4s...")
                await asyncio.sleep(4)
                continue

            logger.info(f"Connecting to {device.name or 'TopBrewer'} ({device.address})...")
            async with BleakClient(device, timeout=15.0) as client:
                topbrewer_client = client
                _ble_connects += 1
                logger.info(f"Connected to {device.name or 'TopBrewer'} via BLE")

                # SAFETY: if a dose was live when the link dropped (or is somehow
                # still marked active), command the machine to a known-safe stopped
                # state FIRST — it auto-reconnects and may have kept dispensing while
                # we were blind.
                if pending_safety_cancel or (active_controller and active_controller.state in ('armed', 'running', 'stopping', 'settling')):
                    logger.warning("TopBrewer reconnected — issuing safety cancel")
                    audit("ble_reconnect_safety_cancel",
                          had_active=bool(active_controller),
                          pending=pending_safety_cancel)
                    try:
                        await send_cancel_to_topbrewer(client)
                    except Exception as ce:
                        logger.error(f"Reconnect safety cancel raised: {ce}")
                    if active_controller and active_controller.state not in ('done', 'aborted'):
                        active_controller.abort("BLE reconnected mid-dose — safety stop")
                        active_controller = None
                    pending_safety_cancel = False

                # Broadcast status change immediately to all connected PWAs
                await broadcast_relay({"type": "status", "connected": True})
                await broadcast_relay({"type": "bridge_stats_update", "bridge_stats": _bridge_stats()})

                await client.start_notify(SFWU_CHANNEL, machine_notification_handler)
                await client.start_notify(BREW_STATUS, machine_notification_handler)
                logger.info("Subscribed to SFWU and Brew Status")

                while client.is_connected:
                    await asyncio.sleep(2)

                logger.warning("TopBrewer disconnected")
                topbrewer_client = None
                _handle_ble_drop_mid_dose()
                await broadcast_relay({"type": "status", "connected": False})

        except Exception as e:
            logger.error(f"TopBrewer Client Error: {e}")
            topbrewer_client = None
            _handle_ble_drop_mid_dose()
            await asyncio.sleep(4)

async def main():
    dose_history.init()  # Console Phase 5: additive dose-history store
    _apply_verbose_audit()  # C3: honor verbose_audit at startup
    service = None
    if HAVE_BLUEZ:
        try:
            logger.info("📡 Starting Bluetooth Scale Service (BlueZ)...")
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
            logger.info("✅ Native BLE GATT Server Registered")

            advert = Advertisement("BOOKOO_PI", [SERVICE_UUID], appearance=0x0000, timeout=0)
            await advert.register(bus, adapter)
            if adapter: await adapter.set_powered(True)
            logger.info("✅ Bluetooth Advertising as 'BOOKOO_PI'")
        except Exception as e:
            logger.warning(f"BlueZ GATT registration skipped: {e}")
    else:
        logger.info("ℹ Running in WebSocket/Bleak Client Mode (BlueZ peripheral emulation disabled on this OS)")

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
        global current_weight, _frames_total, _frames_dropped
        backoff = 1
        while True:
            try:
                ser = serial.Serial(LAUMAS_PORT, LAUMAS_BAUD, parity=serial.PARITY_EVEN, stopbits=1, timeout=0.05)
                audit("serial_connect", port=LAUMAS_PORT, baud=LAUMAS_BAUD)
                backoff = 1  # reset after a successful (re)open
                loop.call_soon_threadsafe(lambda: asyncio.create_task(
                    broadcast_relay({"type": "scale_status", "status": "ok"})))
                buffer = bytearray()
                while True:
                    chunk = ser.read(100)
                    if chunk:
                        buffer.extend(chunk)
                        i = 0
                        while i <= len(buffer) - 15:
                            if buffer[i] == 0x01 and buffer[i+1] == 0x03 and buffer[i+2] == 0x0A:
                                # Validate Modbus RTU CRC16 (trailing 2 bytes, little-endian).
                                crc_ok = crc16_modbus(bytes(buffer[i:i+13])) == (buffer[i+13] | (buffer[i+14] << 8))
                                if not crc_ok:
                                    audit("scale_crc_fail")
                                    if ENFORCE_SCALE_CRC:
                                        _frames_total += 1
                                        _frames_dropped += 1
                                        i += 1  # treat as a false header match; keep scanning
                                        continue
                                raw_val = (buffer[i+11] << 8) | buffer[i+12]
                                new_weight = float(raw_val) / SCALE_DIVISOR
                                # Range check — reject implausible values (garbage / high word).
                                if new_weight < 0 or new_weight > SCALE_MAX_PLAUSIBLE_KG:
                                    audit("scale_range_reject", weight=new_weight)
                                    _frames_total += 1
                                    _frames_dropped += 1
                                    del buffer[:i+15]
                                    i = 0
                                    continue
                                changed = abs(new_weight - current_weight) > 0.01
                                current_weight = new_weight
                                _frames_total += 1
                                # Feed the dose controller on EVERY frame (not only on
                                # change). Its stall detector and scale-stale watchdog
                                # need a true per-frame heartbeat; the >0.01 gate below
                                # only suppresses redundant UI/BLE broadcasts.
                                loop.call_soon_threadsafe(lambda w=new_weight: _feed_dose_controller(w))
                                if changed:
                                    packet = create_bookoo_packet(new_weight)
                                    if service and hasattr(service, 'get_characteristic'):
                                        try:
                                            logger.debug(f"⚖ Scale Weight Update: {new_weight}g")
                                            loop.call_soon_threadsafe(service.get_characteristic(WEIGHT_UUID).changed, packet)
                                        except Exception as ble_err:
                                            audit("ble_notify_error", error=str(ble_err), weight=new_weight)
                                    loop.call_soon_threadsafe(lambda w=new_weight: asyncio.create_task(broadcast_websocket(w)))
                                del buffer[:i+15]
                                i = 0
                                continue
                            i += 1
                        if len(buffer) > 300:
                            audit("buffer_overflow", buffer_size=len(buffer), discarded=100)
                            del buffer[:100]
            except Exception as e:
                logger.warning(f"Scale Serial: {e} (retrying in {backoff}s)")
                audit("serial_error", error=str(e), backoff_s=backoff)
                # Tell clients the scale feed is stale. Any active dose's Pi-side
                # watchdog will force-cancel on its own; this just drives the UI.
                loop.call_soon_threadsafe(lambda: asyncio.create_task(
                    broadcast_relay({"type": "scale_status", "status": "stale"})))
                time.sleep(backoff)
                backoff = min(5, backoff * 2)

    await loop.run_in_executor(None, read_serial_loop)
    await asyncio.get_running_loop().create_future()

if __name__ == "__main__":
    asyncio.run(main())
