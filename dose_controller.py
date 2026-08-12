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


async def send_cancel_to_topbrewer(ble_client) -> bool:
    """
    Send stop + reset to TopBrewer via BLE.
    Matches cancelOrder() in TopBrewerConnection.ts:
      1. Write "stop" to START_SESSION characteristic
      2. Write SFWU COFFEE_RESET to SET_ORDER characteristic

    Returns True only if BOTH writes succeeded. On any failure it returns False
    so the caller can surface the error and retry (e.g. on BLE reconnect) instead
    of assuming the machine has stopped. SAFETY-CRITICAL: a swallowed failure here
    means the machine may keep dispensing while we believe it stopped.
    """
    stop_ok = False
    reset_ok = False
    try:
        await ble_client.write_gatt_char(START_SESSION_UUID, b"stop")
        logger.info("Pi DoseCtrl: Sent 'stop' to START_SESSION")
        stop_ok = True
    except Exception as e:
        logger.error(f"Pi DoseCtrl: Failed to write 'stop': {e}")
        audit("pi_cancel_stop_error", error=str(e))

    try:
        reset_pkt = build_sfwu_reset_packet()
        await ble_client.write_gatt_char(SET_ORDER_UUID, reset_pkt)
        logger.info("Pi DoseCtrl: Sent COFFEE_RESET to SET_ORDER")
        reset_ok = True
    except Exception as e:
        logger.error(f"Pi DoseCtrl: Failed to write COFFEE_RESET: {e}")
        audit("pi_cancel_reset_error", error=str(e))

    return stop_ok and reset_ok


# ============================================================
# PROFILE PERSISTENCE
# ============================================================

PROFILES_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "silo_profiles.json")

DEFAULT_PROFILE = {
    "flow_rate_kg_per_s": 0.05,  # 50 g/s — cautious start
    "valve_delay_s": 0.5,        # derived (overshoot_kg / flow); kept for display/safety timer
    "overshoot_kg": 0.025,       # learned coast-down material — the PRIMARY control quantity
    "total_doses": 0,
}

# Scale quantum used for step-change flow detection (P4). This should track the
# transmitter's real reportable resolution (confirm with tools/scale_registers.py);
# 0.1 kg matches the current parser.
SCALE_QUANTA_KG = 0.1

# Median window for spike rejection on the weight that drives the stop decisions.
# A single spurious frame is out-voted; kept small to minimise latency.
DEBOUNCE_WINDOW = 3


def _median(values):
    s = sorted(values)
    n = len(s)
    if n == 0:
        return 0.0
    mid = n // 2
    return s[mid] if n % 2 else (s[mid - 1] + s[mid]) / 2.0


def load_profile(silo_id: str) -> dict:
    try:
        with open(PROFILES_FILE, 'r') as f:
            all_profiles = json.load(f)
        p = all_profiles.get(silo_id)
        if (p and isinstance(p.get("flow_rate_kg_per_s"), (int, float))
                and isinstance(p.get("valve_delay_s"), (int, float))
                and isinstance(p.get("total_doses"), int)):
            p = dict(p)  # Copy
            # Backfill overshoot_kg for older profiles saved before direct-overshoot learning.
            if not isinstance(p.get("overshoot_kg"), (int, float)):
                p["overshoot_kg"] = p["flow_rate_kg_per_s"] * p["valve_delay_s"]
            return p
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

    # Safety watchdog: if no scale frame reaches the controller for this long
    # while a dose is live, force-cancel (the scale feed has died — going blind).
    SCALE_STALE_S = 1.5

    # Empty/blocked-silo detection: if no meaningful material has been dispensed
    # within this window after starting, the silo is empty or jammed — abort and
    # flag it, rather than silently "completing" a 0 kg dose. NO_FLOW_MIN_KG is one
    # scale quantum; below it we treat the dose as "nothing came out".
    NO_FLOW_TIMEOUT_S = 10.0
    NO_FLOW_MIN_KG = 0.1

    # Learning guards.
    # MIN_LEARN_KG: doses smaller than this are uncontrollable — the coast-down
    # alone exceeds the target, so effective_target floors and the dose can't be
    # steered. They must NOT update the shared per-silo profile: a small dose's
    # `0.9*target` overshoot clamp otherwise slams the learned coast down and
    # destroys the large-dose calibration (observed live: a 0.5 kg dose reset
    # 4 Robusta's overshoot_kg from 1.72 → 0.45, causing the +0.7 overshoots).
    # LEARN_DEADBAND_KG: one scale quantum — inside it we're on target and can't
    # measure finer, so stop integrating and don't chase quantization noise.
    MIN_LEARN_KG = 1.0
    LEARN_DEADBAND_KG = 0.1

    def __init__(self, silo_id: str, target_kg: float, tare_weight: float,
                 ble_client, broadcast_fn, loop,
                 max_dispense_s: float = None, max_weight_kg: float = None,
                 get_ble_client=None, order_id: str = None, control: dict = None):
        """
        Args:
            silo_id: Drink/silo identifier (for profile lookup)
            target_kg: Target dispensed weight (same units as scale)
            tare_weight: Current scale reading at tare time
            ble_client: BleakClient for sending cancel (can be None)
            broadcast_fn: async fn(dict) to broadcast to all WebSocket clients
            loop: asyncio event loop
            max_dispense_s: absolute wall-clock ceiling per dose (hard abort)
            max_weight_kg: absolute dispensed-weight cap (hard abort, e.g. hopper
                overflow weight) — independent of the requested target
            get_ble_client: optional callable returning the CURRENT live BLE client,
                used for cancel so a reconnect after a drop targets the live link
                instead of a stale reference captured at construction time
        """
        self.silo_id = silo_id
        # Unique per-dose id for client-side routing (profile learning still keys
        # on silo_id; this only disambiguates which client/order a broadcast is for).
        self.order_id = order_id
        self.target_kg = target_kg
        self.tare_weight = tare_weight
        self.ble_client = ble_client
        self.broadcast_fn = broadcast_fn
        self.loop = loop
        self.max_dispense_s = max_dispense_s
        self.max_weight_kg = max_weight_kg
        self._get_ble_client = get_ble_client
        self.profile = load_profile(silo_id)

        # Console Phase 7 (C1): control constants are now per-dose params, each
        # DEFAULTING to the original constant so an un-overridden dose behaves
        # exactly as before (dose_sim proves this). The bridge passes overrides
        # from config.json → control; server-side safety caps stay authoritative.
        control = control or {}
        self.settle_s = float(control.get("settle_s", self.SETTLE_TIMEOUT_S))
        self.stall_time_s = float(control.get("stall_time_s", self.STALL_TIMEOUT_S))
        self.stall_kg = float(control.get("stall_kg", self.STALL_THRESHOLD))
        self.scale_stale_s = float(control.get("scale_stale_s", self.SCALE_STALE_S))
        self.debounce = int(control.get("debounce", DEBOUNCE_WINDOW))
        self.backstop_mult = float(control.get("backstop_mult", 1.5))
        self.no_flow_s = float(control.get("no_flow_s", self.NO_FLOW_TIMEOUT_S))
        self.no_flow_min_kg = float(control.get("no_flow_min_kg", self.NO_FLOW_MIN_KG))
        self.min_learn_kg = float(control.get("min_learn_kg", self.MIN_LEARN_KG))
        self.learn_deadband_kg = float(control.get("learn_deadband_kg", self.LEARN_DEADBAND_KG))

        self.state = 'armed'
        self.start_time = 0.0
        self.stop_time = 0.0
        self.last_dispensed = 0.0
        self.samples = []  # [(monotonic_time, dispensed_weight)]
        self.last_activity_time = 0.0
        self.last_known_weight = 0.0
        self.last_weight_time = 0.0   # monotonic time of the last scale frame
        self.cancel_failed = False    # set True if a cancel BLE write did not succeed
        self.dispensed_at_stop = 0.0  # dispensed weight when the stop signal was sent
        self._raw_window = []         # recent raw dispensed values for median debounce

        # P4: step-change flow detection — measures true flow during the active
        # rising phase (between real quantum steps), unbiased by the settle window.
        self.last_quantized_kg = 0.0
        self.last_step_time = 0.0
        self.step_flow_rate = 0.0

        self._preemptive_handle = None
        self._settle_handle = None
        self._safety_handle = None
        self._max_time_handle = None
        self._watchdog_handle = None
        self._no_flow_handle = None
        self.effective_target = target_kg  # target minus learned coast-down (set in start)

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
            logger.warning(f"Pi DoseCtrl: Cannot start from state '{self.state}'")
            return

        self.start_time = time.monotonic()
        self.last_activity_time = self.start_time
        self.last_weight_time = self.start_time
        self.last_known_weight = self.last_dispensed
        self.last_quantized_kg = self.last_dispensed
        self.last_step_time = 0.0
        self.step_flow_rate = 0.0
        self.state = 'running'

        # Effective target = target minus the learned coast-down material. We use
        # the directly-learned overshoot_kg (NOT flow*valve_delay) so the flow
        # estimate never enters the control path — this avoids amplifying flow
        # noise into the stop point, which otherwise makes doses oscillate.
        overshoot = self.profile.get(
            'overshoot_kg',
            self.profile['flow_rate_kg_per_s'] * self.profile['valve_delay_s'])
        effective_target = max(0.005, self.target_kg - overshoot)
        self.effective_target = effective_target

        # The weight-based stop at effective_target is the PRIMARY cutoff (it is
        # flow-independent and robust). The preemptive timer is a conservative
        # BACKSTOP set at 1.5x the expected fill time — it must NOT race and
        # pre-empt the weight-stop (an early fire from a noisy flow estimate would
        # corrupt the dose). It only catches a dose running far longer than
        # expected; the scale-stale watchdog and MAX_DISPENSE_S sit above it.
        expected_s = self.target_kg / max(self.profile['flow_rate_kg_per_s'], 1e-3)
        seconds_until_stop = max(0.5, expected_s * self.backstop_mult)

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

        # --- Absolute safety backstops (independent of the learned profile) ---
        # Hard wall-clock ceiling: nothing may dispense longer than this.
        if self.max_dispense_s:
            self._max_time_handle = self.loop.call_later(
                self.max_dispense_s, self._max_time_fire
            )
        # Scale-feed watchdog: force-cancel if the weight stream goes silent.
        self._watchdog_handle = self.loop.call_later(
            self.scale_stale_s, self._watchdog_tick
        )
        # Empty/blocked-silo watchdog: if nothing meaningful is dispensed within
        # no_flow_s, the silo is empty or jammed — abort and flag it rather than
        # silently "completing" a 0 kg dose. Distinct from the scale-stale watchdog
        # (the scale is fine here; the weight just never rises).
        self._no_flow_handle = self.loop.call_later(
            self.no_flow_s, self._no_flow_check
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
        self.last_weight_time = now  # feed the scale-stale watchdog (every frame)

        # Median debounce: a single spurious frame is out-voted so it can't trip
        # the hard stop or the max-weight cap. Small window keeps latency minimal.
        raw = max(0, weight - self.tare_weight)
        self._raw_window.append(raw)
        if len(self._raw_window) > self.debounce:
            self._raw_window = self._raw_window[-self.debounce:]
        dispensed = _median(self._raw_window)
        self.last_dispensed = dispensed

        self.samples.append((now, dispensed))
        if len(self.samples) > 20:
            self.samples = self.samples[-20:]

        # --- Absolute max-weight cap (any live state) ---
        # Last-ditch overflow guard on the GROSS scale reading (dispensed + tare),
        # so it protects even when dosing onto a partially-full hopper. Independent
        # of the requested target; fires even during stopping/settling (e.g. a
        # valve that failed to close).
        gross = dispensed + self.tare_weight
        if self.max_weight_kg and gross >= self.max_weight_kg:
            logger.warning(
                f"Pi DoseCtrl: MAX-WEIGHT abort at gross {gross:.3f} "
                f"(cap {self.max_weight_kg:.3f}, dispensed {dispensed:.3f})"
            )
            audit("pi_max_weight", silo_id=self.silo_id, dispensed=dispensed,
                  gross=gross, cap=self.max_weight_kg)
            self._force_abort("max_weight")
            return

        # --- Running: weight-based safety stop ---
        if self.state == 'running':
            # P4: step-change flow detection — when the (debounced) weight jumps
            # by a full scale quantum, compute flow from the exact 0.1 kg step and
            # the time since the last step. Measured ONLY during the active rising
            # phase, so it is not diluted by the post-stop settle window.
            step_delta = abs(dispensed - self.last_quantized_kg)
            if step_delta >= SCALE_QUANTA_KG * 0.9:
                if self.last_step_time > 0:
                    step_time_s = now - self.last_step_time
                    if step_time_s > 0.05:  # ignore implausibly fast steps
                        self.step_flow_rate = SCALE_QUANTA_KG / step_time_s
                self.last_quantized_kg = dispensed
                self.last_step_time = now

            # Weight-based stop at the effective target (target minus learned
            # coast-down). Stopping here and letting the valve coast lands us on
            # the real target. Robust to flow-estimate error (see start()).
            if dispensed >= self.effective_target:
                logger.info(
                    f"Pi DoseCtrl: Weight-based stop at {dispensed:.3f} "
                    f"(effective target {self.effective_target:.3f})"
                )
                audit("pi_hard_stop", silo_id=self.silo_id, dispensed=dispensed,
                      target=self.target_kg, effective_target=self.effective_target)
                self._send_stop()
                return

            # Stall detection — exact same as TypeScript, but only once real flow
            # has begun (dispensed past one scale quantum). Before any material
            # comes out, the empty/blocked-silo watchdog (_no_flow_check) owns the
            # timeout, so a stall here can't pre-empt it and silently "complete" a
            # 0 kg dose. Once beans are flowing, stall behaves exactly as before.
            if abs(dispensed - self.last_known_weight) > self.stall_kg:
                self.last_activity_time = now
                self.last_known_weight = dispensed
            elif (dispensed > self.no_flow_min_kg
                  and now - self.last_activity_time > self.stall_time_s):
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
            "orderId": self.order_id,
            "state": "aborted",
            "reason": reason,
        }))

    # --------------------------------------------------------
    # PRIVATE
    # --------------------------------------------------------

    def _max_time_fire(self):
        """Absolute wall-clock ceiling reached — hard abort."""
        if self.state in ('done', 'aborted'):
            return
        logger.warning(
            f"Pi DoseCtrl: MAX-TIME abort after {self.max_dispense_s:.0f}s "
            f"at dispensed={self.last_dispensed:.3f}"
        )
        audit("pi_max_time", silo_id=self.silo_id,
              max_dispense_s=self.max_dispense_s, dispensed=self.last_dispensed)
        self._force_abort("max_time")

    def _watchdog_tick(self):
        """Scale-feed watchdog — abort if no weight frame has arrived recently."""
        if self.state in ('done', 'aborted'):
            return
        idle = time.monotonic() - self.last_weight_time
        if idle >= self.scale_stale_s:
            logger.warning(
                f"Pi DoseCtrl: SCALE-STALE abort — no weight for {idle:.1f}s "
                f"at dispensed={self.last_dispensed:.3f}"
            )
            audit("pi_scale_stale", silo_id=self.silo_id, idle_s=round(idle, 2),
                  dispensed=self.last_dispensed)
            self._force_abort("scale_stale")
        else:
            # Re-arm for the remaining window.
            self._watchdog_handle = self.loop.call_later(
                self.scale_stale_s - idle, self._watchdog_tick
            )

    def _no_flow_check(self):
        """
        Empty/blocked-silo detector — abort if no meaningful material has been
        dispensed within no_flow_s of starting. This is the empty-silo / jam case
        (the scale is alive but the weight never rises), so we flag it as
        'empty_or_blocked_silo' instead of quietly completing a 0 kg dose. If flow
        has already started (dispensed ≥ no_flow_min_kg), this is a no-op.
        """
        if self.state != 'running':
            return
        if self.last_dispensed >= self.no_flow_min_kg:
            return  # beans are flowing — nothing to flag
        logger.warning(
            f"Pi DoseCtrl: EMPTY/BLOCKED SILO — only {self.last_dispensed:.3f} "
            f"dispensed in {self.no_flow_s:.0f}s"
        )
        audit("pi_empty_silo", silo_id=self.silo_id,
              dispensed=self.last_dispensed, timeout_s=self.no_flow_s)
        self._force_abort("empty_or_blocked_silo")

    def _force_abort(self, reason: str):
        """
        Hard safety abort (distinct from the graceful stop path): cancel all
        timers, command the machine to stop, mark aborted, and tell clients.
        Used by the absolute ceilings and the scale-stale watchdog.
        """
        if self.state in ('done', 'aborted'):
            return
        self._cancel_timers()
        self.stop_time = time.monotonic()
        self.state = 'aborted'
        audit("pi_force_abort", silo_id=self.silo_id, reason=reason,
              dispensed=self.last_dispensed)
        asyncio.ensure_future(self._do_cancel())
        asyncio.ensure_future(self.broadcast_fn({
            "type": "dose_update",
            "siloId": self.silo_id,
            "orderId": self.order_id,
            "state": "aborted",
            "reason": reason,
        }))

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
        self.dispensed_at_stop = self.last_dispensed  # material dispensed BEFORE coast-down
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
        """
        Send BLE cancel commands to the machine. Uses the CURRENT live client
        (via get_ble_client) if available, so a cancel after a BLE drop targets
        the reconnected link rather than a stale reference. A failure is
        surfaced (audit + dose_error broadcast) and flagged so it can be retried
        on reconnect — never silently treated as a successful stop.
        """
        client = self._get_ble_client() if self._get_ble_client else self.ble_client
        if not client:
            self.cancel_failed = True
            logger.error("Pi DoseCtrl: Cancel FAILED — no live BLE client")
            audit("pi_cancel_no_client", silo_id=self.silo_id)
            await self.broadcast_fn({
                "type": "dose_error",
                "siloId": self.silo_id,
                "orderId": self.order_id,
                "error": "cancel could not be sent — machine link is down",
            })
            return
        try:
            ok = await send_cancel_to_topbrewer(client)
        except Exception as e:
            ok = False
            logger.error(f"Pi DoseCtrl: Cancel raised: {e}")
        if ok:
            self.cancel_failed = False
            audit("pi_cancel_sent", silo_id=self.silo_id)
        else:
            self.cancel_failed = True
            logger.error("Pi DoseCtrl: Cancel write did NOT confirm — machine may still be dispensing")
            audit("pi_cancel_failed", silo_id=self.silo_id)
            await self.broadcast_fn({
                "type": "dose_error",
                "siloId": self.silo_id,
                "orderId": self.order_id,
                "error": "STOP command not confirmed — verify the machine has stopped",
            })

    def _schedule_settle(self):
        """Reset settle timer — wait for stable reading."""
        if self._settle_handle:
            self._settle_handle.cancel()
        self._settle_handle = self.loop.call_later(
            self.settle_s, self._settle_fire
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

        # Flow rate: prefer the active-phase step-flow (P4), which is measured
        # only while rising and is NOT diluted by the settle window. Fall back to
        # the material dispensed up to the stop signal over the rising duration —
        # still unbiased. Only as a last resort use the coarse total-duration ratio.
        rising_s = (self.stop_time - self.start_time) if self.stop_time else duration_s
        if self.step_flow_rate > 0:
            flow_rate = self.step_flow_rate
        elif rising_s > 0.1 and self.dispensed_at_stop > 0.001:
            flow_rate = self.dispensed_at_stop / rising_s
        else:
            flow_rate = self.profile['flow_rate_kg_per_s']

        # Predictive stop lead-time (C2, additive): how many seconds before the
        # target the loop stopped, at the measured flow. Derived from existing
        # state; does not affect control.
        lead_s = ((self.target_kg - self.dispensed_at_stop) / flow_rate) \
            if (flow_rate > 0 and self.dispensed_at_stop) else 0.0
        result = {
            "targetKg": self.target_kg,
            "actualKg": round(actual, 4),
            "overshootKg": round(overshoot, 4),
            "durationMs": round(duration_s * 1000, 1),
            "flowRateKgPerS": round(flow_rate, 4),
            "leadS": round(max(0.0, lead_s), 3),
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
            "orderId": self.order_id,
            "state": "done",
            "result": result,
        }))

    def _learn(self, actual, duration_s, flow_rate):
        """
        Adaptive EMA learning (P2). Flow rate comes from the active-rising phase
        (see _complete). Valve delay is derived DIRECTLY from the coast-down
        material — the weight gained AFTER the stop signal — rather than the old
        algebraic form that divided by a settle-inflated duration. This removes
        the systematic under-flow / inflated-delay bias so doses converge.
        """
        if actual < 0.001 or duration_s < 0.1:
            return  # Skip bogus doses

        # Uncontrollable small doses (auto-top-ups / tiny tests) must NOT touch the
        # shared per-silo profile. Their coast alone exceeds the target so they
        # can't be steered, and the `0.9*target` clamp below would slam the learned
        # coast down and wreck the large-dose calibration (see MIN_LEARN_KG note).
        if self.target_kg < self.min_learn_kg:
            logger.info(
                f"Pi DoseCtrl: skip learn — dose {self.target_kg:.3f}kg "
                f"< min_learn {self.min_learn_kg:.2f}kg (uncontrollable)"
            )
            audit("pi_learn_skipped_small", silo_id=self.silo_id, target=self.target_kg)
            return

        # P2: adaptive alpha — aggressive when the profile is young, smooth later.
        doses = self.profile['total_doses']
        count_alpha = 1.0 if doses == 0 else (0.7 if doses < 3 else (0.4 if doses < 10 else 0.2))

        # Flow rate learning (used only for the preemptive timer + display).
        self.profile['flow_rate_kg_per_s'] = (
            (1 - count_alpha) * self.profile['flow_rate_kg_per_s'] + count_alpha * flow_rate
        )

        # PRIMARY control: integral feedback on the net output error. If we
        # overshot by X, raise overshoot_kg by (a fraction of) X so next time we
        # stop that much earlier — and vice versa. This is negative feedback on
        # the ACTUAL result, so it converges whether the weight-stop or the
        # preemptive timer fired, and regardless of flow-estimate error. (Learning
        # the coast material from actual-dispensed_at_stop instead spirals when the
        # timer fires early, mis-reading the gap as coast.)
        error = actual - self.target_kg
        if abs(error) <= self.learn_deadband_kg:
            # On target within one scale quantum — don't integrate quantization /
            # coast noise, or the loop hovers at the noise floor instead of settling.
            adj = 0.0
        else:
            # Adaptive gain: correct a large miss FAST (a bad seed or a perturbation
            # should recover in ~2 doses, not ~10), smooth a small one. The old flat
            # 0.2 EMA is exactly why a matured profile felt "stuck at a constant
            # offset" — it removed only a fifth of the error per (~45 s) dose.
            mag_alpha = 0.7 if abs(error) > 0.3 else 0.5
            alpha_eff = max(count_alpha, mag_alpha)
            adj = alpha_eff * error

        prev = self.profile.get('overshoot_kg',
                                self.profile['flow_rate_kg_per_s'] * self.profile['valve_delay_s'])
        new_overshoot = prev + adj
        self.profile['overshoot_kg'] = max(0.0, min(new_overshoot, self.target_kg * 0.9))

        # Keep valve_delay_s as a derived, human-readable value (overshoot / flow).
        if self.profile['flow_rate_kg_per_s'] > 0.001:
            self.profile['valve_delay_s'] = self.profile['overshoot_kg'] / self.profile['flow_rate_kg_per_s']

        self.profile['total_doses'] += 1
        save_profile(self.silo_id, self.profile)

        logger.info(
            f"Pi DoseCtrl: Learned flow={self.profile['flow_rate_kg_per_s']:.3f}/s "
            f"overshoot={self.profile['overshoot_kg']:.3f}kg "
            f"delay={self.profile['valve_delay_s']:.2f}s doses={self.profile['total_doses']}"
        )
        audit("pi_profile_learned", silo_id=self.silo_id,
              flow_rate=self.profile['flow_rate_kg_per_s'],
              overshoot_kg=self.profile['overshoot_kg'],
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
            "orderId": self.order_id,
            "state": self.state,
            "dispensedKg": round(self.last_dispensed, 4),
            "targetKg": self.target_kg,
            "progress": round(progress, 3),
            "flowRateKgPerS": round(self._compute_flow_rate(), 4),
        })

    def _cancel_timers(self):
        for handle in (self._preemptive_handle, self._settle_handle,
                       self._safety_handle, self._max_time_handle,
                       self._watchdog_handle, self._no_flow_handle):
            if handle:
                handle.cancel()
        self._preemptive_handle = None
        self._settle_handle = None
        self._safety_handle = None
        self._max_time_handle = None
        self._watchdog_handle = None
        self._no_flow_handle = None
