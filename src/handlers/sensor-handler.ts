import type { Logging } from 'homebridge';
import { SENSOR_PULSE_MS } from '../constants/homekit-constant.js';
import type { EventBusService } from '../services/event-bus-service.js';
import { EventType } from '../types/event-type.js';
import type { SensorKind } from '../types/sensor-kind-type.js';

/**
 * Owns the current state of every motion sensor and publishes changes over the
 * bus (SENSOR_STATE_CHANGED), which MatterService pushes to Matter. Sensors are
 * Matter-only, so no HomeKit characteristics are touched here.
 */
export class SensorHandler {
  private readonly currentValueByKind: Record<SensorKind, boolean> = {
    arming: false,
    tripped: false,
    reset: false,
  };

  constructor(
    private readonly log: Logging,
    private readonly bus: EventBusService,
  ) {}

  // ── Arming sensor ──────────────────────────────────────────────────────────

  updateArmingMotionSensor(value: boolean): void {
    this.setSensorValue('arming', value);
  }

  resetArmingMotionSensor(): void {
    if (this.currentValueByKind.arming) {
      this.setSensorValue('arming', false);
    }
  }

  // ── Tripped sensor ─────────────────────────────────────────────────────────

  pulseTrippedMotionSensor(): void {
    this.setTrippedMotionSensor(true);
    this.scheduleReset('tripped');
  }

  setTrippedMotionSensor(value: boolean): void {
    this.setSensorValue('tripped', value);
  }

  resetTrippedMotionSensor(): void {
    if (this.currentValueByKind.tripped) {
      this.setSensorValue('tripped', false);
    }
  }

  // ── Reset sensor ───────────────────────────────────────────────────────────

  pulseResetMotionSensor(): void {
    this.setSensorValue('reset', true);
    this.scheduleReset('reset');
    this.log.debug('Reset sensor (Triggered)');
  }

  /** Returns the current value of the given sensor, for Matter startup sync. */
  getMotionState(kind: SensorKind): boolean {
    return this.currentValueByKind[kind];
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private setSensorValue(kind: SensorKind, value: boolean): void {
    this.currentValueByKind[kind] = value;
    this.bus.emit(EventType.SENSOR_STATE_CHANGED, { sensor: kind, value });
  }

  private scheduleReset(kind: SensorKind): void {
    setTimeout(() => {
      this.setSensorValue(kind, false);
    }, SENSOR_PULSE_MS);
  }
}