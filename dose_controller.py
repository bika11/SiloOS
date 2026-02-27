"""
Pi-Side Gravimetric Dose Controller
====================================
Exact port of dashboard/src/features/dosing/DoseController.ts.

Runs in the asyncio event loop on the Raspberry Pi. Monitors the scale,
fires a preemptive stop timer, and sends the BLE cancel command directly
to the TopBrewer — no browser in the loop.

State machine: idle → armed → running → stopping → settling → done | aborted

IMPORTANT: This module ONLY controls when to STOP dispensing.
The dashboard still sends the brew/order command via the existing BLE relay.
"""

import asyncio
import json
import logging
import os
import struct
import time
from binascii import crc32 as _crc32

logger = logging.getLogger("SiloOS")

# Re-use the audit function from ble_bridge (set after import)
_audit_fn = None

def audit(event_type, **kwargs):
    if _audit_fn:
        _audit_fn(event_type, **kwargs)

def set_audit_fn(fn):
    global _audit_fn
    _audit_fn = fn


# ============================================================
# SFWU CANCEL COMMAND BUILDER
# ============================================================

# TopBrewer BLE UUIDs for cancel
START_SESSION_UUID = "c0ffee00-2624-46ff-9311-4d7083160503"
SET_ORDER_UUID     = "c0ffee00-2624-46ff-9311-4d7083160501"

# SFWU Protocol
SFWU_SYNC         = 0xAA
SFWU_VER          = 0x01
SFWU_ADDR_CLIENT  = 0x01  # TO: the machine
SFWU_ADDR_RELAY   = 0x02  # FROM: us (the relay/app)
SFWU_CMD_RESET    = 0x00C0


def _crc32_bytes(data: bytes) -> bytes:
    """CRC32 (Ethernet/IEEE 802.3) → 4 bytes big-endian. Matches TypeScript crc32Bytes()."""
    crc = _crc32(data) & 0xFFFFFFFF
    return struct.pack('>I', crc)


def build_sfwu_reset_packet() -> bytes:
    """Build COFFEE_RESET SFWU packet (16 bytes). Matches buildResetCommand() in TypeScript."""
    # Header: 12 bytes — SYNC(1) VER(1) TO(1) FROM(1) CMD(2) ID(2) LENGTH(4)
    header = struct.pack('>BBBBHHI',
        SFWU_SYNC,
        SFWU_VER,
        SFWU_ADDR_CLIENT,
        SFWU_ADDR_RELAY,
        SFWU_CMD_RESET,
        0x0000,      # packet ID
        0x00000000,  # data length (0 for reset)
    )
    # CRC32 over header (no data payload)
    crc = _crc32_bytes(header)
    return header + crc


async def send_cancel_to_topbrewer(ble_client):
    """
    Send stop + reset to TopBrewer via BLE.
    Matches cancelOrder() in TopBrewerConnection.ts:
      1. Write "stop" to START_SESSION characteristic
      2. Write SFWU COFFEE_RESET to SET_ORDER characteristic
    """
    try:
        await ble_client.write_gatt_char(START_SESSION_UUID, b"stop")
        logger.info("Pi DoseCtrl: Sent 'stop' to START_SESSION")
    except Exception as e:
        logger.error(f"Pi DoseCtrl: Failed to write 'stop': {e}")
        audit("pi_cancel_stop_error", error=str(e))

    try:
        reset_pkt = build_sfwu_reset_packet()
        await ble_client.write_gatt_char(SET_ORDER_UUID, reset_pkt)
        logger.info("Pi DoseCtrl: Sent COFFEE_RESET to SET_ORDER")
    except Exception as e:
        logger.error(f"Pi DoseCtrl: Failed to write COFFEE_RESET: {e}")
        audit("pi_cancel_reset_error", error=str(e))


# ============================================================
# PROFILE PERSISTENCE
# ============================================================

PROFILES_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "silo_profiles.json")

DEFAULT_PROFILE = {
    "flow_rate_kg_per_s": 0.05,  # 50 g/s — cautious start
    "valve_delay_s": 0.5,
    "total_doses": 0,
}


def load_profile(silo_id: str) -> dict:
    try:
        with open(PROFILES_FILE, 'r') as f:
            all_profiles = json.load(f)
        p = all_profiles.get(silo_id)
        if (p and isinstance(p.get("flow_rate_kg_per_s"), (int, float))
                and isinstance(p.get("valve_delay_s"), (int, float))
                and isinstance(p.get("total_doses"), int)):
            return dict(p)  # Copy
    except Exception:
        pass
    return dict(DEFAULT_PROFILE)


def save_profile(silo_id: str, profile: dict):
    try:
        try:
            with open(PROFILES_FILE, 'r') as f:
                all_profiles = json.load(f)
        except Exception:
            all_profiles = {}
        all_profiles[silo_id] = profile
        with open(PROFILES_FILE, 'w') as f:
            json.dump(all_profiles, f, indent=2)
    except Exception as e:
        logger.error(f"Pi DoseCtrl: Failed to save profile: {e}")


# ============================================================
# DOSE CONTROLLER
# ============================================================

class PiDoseController:
    """
    Pi-side gravimetric dose controller.
    Exact behavioral port of DoseController.ts.

    Runs in asyncio event loop. Uses asyncio timers instead of setTimeout.
    Sends BLE cancel command directly — no browser needed.
    """

    # Stall detection: no weight change > 5g for 3 seconds
    STALL_TIMEOUT_S = 3.0
    STALL_THRESHOLD = 0.005  # Same unit as weight (matching TS: 0.005 kg)

    # Settling: 2 seconds of no new weight = settled
    SETTLE_TIMEOUT_S = 2.0

    def __init__(self, silo_id: str, target_kg: float, tare_weight: float,
                 ble_client, broadcast_fn, loop):
        """
        Args:
            silo_id: Drink/silo identifier (for profile lookup)
            target_kg: Target dispensed weight (same units as scale)
            tare_weight: Current scale reading at tare time
            ble_client: BleakClient for sending cancel (can be None)
            broadcast_fn: async fn(dict) to broadcast to all WebSocket clients
            loop: asyncio event loop
        """
        self.silo_id = silo_id
        self.target_kg = target_kg
        self.tare_weight = tare_weight
        self.ble_client = ble_client
        self.broadcast_fn = broadcast_fn
        self.loop = loop
        self.profile = load_profile(silo_id)

        self.state = 'armed'
        self.start_time = 0.0
        self.stop_time = 0.0
        self.last_dispensed = 0.0
        self.samples = []  # [(monotonic_time, dispensed_weight)]
        self.last_activity_time = 0.0
        self.last_known_weight = 0.0

        self._preemptive_handle = None
        self._settle_handle = None
        self._safety_handle = None

        logger.info(
            f"Pi DoseCtrl: Armed silo=\"{silo_id}\" target={target_kg:.3f} "
            f"tare={tare_weight:.1f} profile: flow={self.profile['flow_rate_kg_per_s']:.3f}/s "
            f"delay={self.profile['valve_delay_s']:.2f}s doses={self.profile['total_doses']}"
        )
        audit("pi_dose_armed", silo_id=silo_id, target=target_kg,
              tare=tare_weight, profile=self.profile)

    # --------------------------------------------------------
    # PUBLIC API
    # --------------------------------------------------------

    def start(self):
        """
        Begin active monitoring. Call AFTER the order has been sent to TopBrewer.
        Sets the preemptive stop timer.
        """
        if self.state != 'armed':
            logger.warn(f"Pi DoseCtrl: Cannot start from state '{self.state}'")
            return

        self.start_time = time.monotonic()
        self.last_activity_time = self.start_time
        self.last_known_weight = self.last_dispensed
        self.state = 'running'

        # Preemptive timer — exact same formula as TypeScript DoseController
        overshoot = self.profile['flow_rate_kg_per_s'] * self.profile['valve_delay_s']
        effective_target = max(0.005, self.target_kg - overshoot)
        seconds_until_stop = max(0.1, effective_target / self.profile['flow_rate_kg_per_s'])

        logger.info(
            f"Pi DoseCtrl: RUNNING target={self.target_kg:.3f} "
            f"effective={effective_target:.3f} stopIn={seconds_until_stop:.2f}s"
        )
        audit("pi_dose_running", silo_id=self.silo_id,
              target=self.target_kg, effective_target=effective_target,
              stop_in_s=round(seconds_until_stop, 3))

        self._preemptive_handle = self.loop.call_later(
            seconds_until_stop, self._preemptive_fire
        )

        # Broadcast initial state
        asyncio.ensure_future(self._broadcast_update())

    def on_weight(self, weight):
        """
        Feed a new weight reading (same units as scale).
        Called on every scale update from the serial thread (via call_soon_threadsafe).
        """
        if self.state in ('idle', 'armed', 'done', 'aborted'):
            return

        now = time.monotonic()
        dispensed = max(0, weight - self.tare_weight)
        self.last_dispensed = dispensed

        self.samples.append((now, dispensed))
        if len(self.samples) > 20:
            self.samples = self.samples[-20:]

        # --- Running: weight-based safety stop ---
        if self.state == 'running':
            # Hard stop if already past target
            if dispensed >= self.target_kg:
                logger.warning(
                    f"Pi DoseCtrl: Weight-based hard stop at {dispensed:.3f}"
                )
                audit("pi_hard_stop", silo_id=self.silo_id, dispensed=dispensed,
                      target=self.target_kg)
                self._send_stop()
                return

            # Stall detection — exact same as TypeScript
            if abs(dispensed - self.last_known_weight) > self.STALL_THRESHOLD:
                self.last_activity_time = now
                self.last_known_weight = dispensed
            elif now - self.last_activity_time > self.STALL_TIMEOUT_S:
                logger.warning(
                    f"Pi DoseCtrl: STALL DETECTED ({now - self.last_activity_time:.1f}s)"
                )
                audit("pi_stall_detected", silo_id=self.silo_id,
                      stall_duration_s=round(now - self.last_activity_time, 2),
                      dispensed=dispensed)
                self._send_stop()
                return

        # --- Stopping / Settling ---
        if self.state in ('stopping', 'settling'):
            if self.state == 'stopping':
                self.state = 'settling'
            self._schedule_settle()

        # Broadcast progress to all clients
        asyncio.ensure_future(self._broadcast_update())

    def abort(self, reason='User aborted'):
        """Abort dosing immediately. Sends cancel to machine."""
        if self.state in ('done', 'aborted', 'idle'):
            return
        self._cancel_timers()
        self.state = 'aborted'
        logger.warning(f"Pi DoseCtrl: Aborted — {reason}")
        audit("pi_dose_abort", silo_id=self.silo_id, reason=reason,
              dispensed=self.last_dispensed)

        # Send cancel
        asyncio.ensure_future(self._do_cancel())

        # Broadcast abort to all clients
        asyncio.ensure_future(self.broadcast_fn({
            "type": "dose_update",
            "siloId": self.silo_id,
            "state": "aborted",
            "reason": reason,
        }))

    # --------------------------------------------------------
    # PRIVATE
    # --------------------------------------------------------

    def _preemptive_fire(self):
        """Preemptive timer fired. Send stop."""
        if self.state != 'running':
            return
        logger.info(
            f"Pi DoseCtrl: Preemptive stop fired at dispensed={self.last_dispensed:.3f}"
        )
        audit("pi_preemptive_stop", silo_id=self.silo_id,
              dispensed=self.last_dispensed, target=self.target_kg)
        self._send_stop()

    def _send_stop(self):
        """Send stop command to machine. Transition to stopping."""
        if self.state != 'running':
            return
        self._cancel_timers()
        self.stop_time = time.monotonic()
        self.state = 'stopping'

        logger.info(f"Pi DoseCtrl: Stop command at dispensed={self.last_dispensed:.3f}")
        audit("pi_stop_sent", silo_id=self.silo_id, dispensed=self.last_dispensed)

        # Send BLE cancel
        asyncio.ensure_future(self._do_cancel())

        # Safety timer: if no weight arrives to confirm settling
        safety_s = self.profile['valve_delay_s'] + 3.0
        self._safety_handle = self.loop.call_later(safety_s, self._safety_complete)

        # Broadcast state change
        asyncio.ensure_future(self._broadcast_update())

    async def _do_cancel(self):
        """Actually send BLE cancel commands."""
        if self.ble_client:
            try:
                await send_cancel_to_topbrewer(self.ble_client)
                audit("pi_cancel_sent", silo_id=self.silo_id)
            except Exception as e:
                logger.error(f"Pi DoseCtrl: Cancel failed: {e}")
                audit("pi_cancel_failed", silo_id=self.silo_id, error=str(e))

    def _schedule_settle(self):
        """Reset settle timer — wait for stable reading."""
        if self._settle_handle:
            self._settle_handle.cancel()
        self._settle_handle = self.loop.call_later(
            self.SETTLE_TIMEOUT_S, self._settle_fire
        )

    def _settle_fire(self):
        if self.state == 'settling':
            self._complete()

    def _safety_complete(self):
        if self.state in ('stopping', 'settling'):
            logger.warning("Pi DoseCtrl: Safety timeout — completing without weight confirmation")
            audit("pi_safety_timeout", silo_id=self.silo_id,
                  dispensed=self.last_dispensed)
            self._complete()

    def _complete(self):
        """Dose complete. Calculate result, learn, broadcast."""
        self._cancel_timers()
        duration_s = time.monotonic() - self.start_time
        actual = self.last_dispensed
        overshoot = actual - self.target_kg
        flow_rate = (actual / duration_s) if duration_s > 0.1 else self.profile['flow_rate_kg_per_s']

        result = {
            "targetKg": self.target_kg,
            "actualKg": round(actual, 4),
            "overshootKg": round(overshoot, 4),
            "durationMs": round(duration_s * 1000, 1),
            "flowRateKgPerS": round(flow_rate, 4),
        }

        # Learn from this dose
        self._learn(actual, duration_s, flow_rate)

        self.state = 'done'
        logger.info(
            f"Pi DoseCtrl: COMPLETE target={result['targetKg']:.3f} "
            f"actual={result['actualKg']:.3f} overshoot={result['overshootKg']:.3f} "
            f"flow={result['flowRateKgPerS']:.3f}/s"
        )
        audit("pi_dose_complete", silo_id=self.silo_id, **result)

        # Broadcast result to ALL clients
        asyncio.ensure_future(self.broadcast_fn({
            "type": "dose_update",
            "siloId": self.silo_id,
            "state": "done",
            "result": result,
        }))

    def _learn(self, actual, duration_s, flow_rate):
        """Exponential Moving Average learning. Exact port of DoseController.learn()."""
        if actual < 0.001 or duration_s < 0.1:
            return  # Skip bogus doses

        alpha = 1.0 if self.profile['total_doses'] == 0 else 0.3

        # Flow rate learning
        self.profile['flow_rate_kg_per_s'] = (
            (1 - alpha) * self.profile['flow_rate_kg_per_s'] + alpha * flow_rate
        )

        # Valve delay learning: overshoot = flowRate * valveDelay
        stop_at_s = self.stop_time - self.start_time if self.stop_time else duration_s
        material_after_stop = actual - (flow_rate * stop_at_s)
        if flow_rate > 0.001:
            observed_delay = material_after_stop / flow_rate
            new_delay = (1 - alpha) * self.profile['valve_delay_s'] + alpha * observed_delay
            self.profile['valve_delay_s'] = max(0, new_delay)

        self.profile['total_doses'] += 1
        save_profile(self.silo_id, self.profile)

        logger.info(
            f"Pi DoseCtrl: Learned flow={self.profile['flow_rate_kg_per_s']:.3f}/s "
            f"delay={self.profile['valve_delay_s']:.2f}s doses={self.profile['total_doses']}"
        )
        audit("pi_profile_learned", silo_id=self.silo_id,
              flow_rate=self.profile['flow_rate_kg_per_s'],
              valve_delay=self.profile['valve_delay_s'],
              total_doses=self.profile['total_doses'])

    def _compute_flow_rate(self) -> float:
        """Flow rate from last 5 samples. Matches computeFlowRate() in TypeScript."""
        window = self.samples[-5:]
        if len(window) < 2:
            return 0
        t0, w0 = window[0]
        t1, w1 = window[-1]
        dt = t1 - t0
        if dt <= 0:
            return 0
        return max(0, (w1 - w0) / dt)

    async def _broadcast_update(self):
        """Broadcast current dose state to all WebSocket clients."""
        progress = min(1.0, self.last_dispensed / self.target_kg) if self.target_kg > 0 else 0
        await self.broadcast_fn({
            "type": "dose_update",
            "siloId": self.silo_id,
            "state": self.state,
            "dispensedKg": round(self.last_dispensed, 4),
            "targetKg": self.target_kg,
            "progress": round(progress, 3),
            "flowRateKgPerS": round(self._compute_flow_rate(), 4),
        })

    def _cancel_timers(self):
        for handle in (self._preemptive_handle, self._settle_handle, self._safety_handle):
            if handle:
                handle.cancel()
        self._preemptive_handle = None
        self._settle_handle = None
        self._safety_handle = None
