import type { Logging } from 'homebridge';
import { SENSOR_PULSE_MS } from '../constants/homekit-constant.js';
import type { ServiceRegistry } from '../interfaces/service-registry-interface.js';
import type { CharacteristicConstructor } from '../interfaces/hap-types-interface.js';

/** Manages all motion sensor characteristic updates. */
export class SensorHandler {
  constructor(
    private readonly services: ServiceRegistry,
    private readonly Characteristic: CharacteristicConstructor,
    private readonly log: Logging,
  ) {}

  // ── Arming sensor ──────────────────────────────────────────────────────────

  updateArmingMotionSensor(value: boolean): void {
    this.services.armingMotionSensorService.updateCharacteristic(
      this.Characteristic.MotionDetected,
      value,
    );
  }

  resetArmingMotionSensor(): void {
    const current = this.services.armingMotionSensorService
      .getCharacteristic(this.Characteristic.MotionDetected).value;

    if (current) {
      this.services.armingMotionSensorService.updateCharacteristic(
        this.Characteristic.MotionDetected,
        false,
      );
    }
  }

  // ── Tripped sensor ─────────────────────────────────────────────────────────

  pulseTrippedMotionSensor(): void {
    this.services.trippedMotionSensorService.updateCharacteristic(
      this.Characteristic.MotionDetected,
      true,
    );
    this.scheduleReset(this.services.trippedMotionSensorService);
  }

  resetTrippedMotionSensor(): void {
    const char = this.services.trippedMotionSensorService
      .getCharacteristic(this.Characteristic.MotionDetected);
    if (char.value) {
      char.updateValue(false);
    }
  }

  // ── Triggered sensor ───────────────────────────────────────────────────────

  pulseTriggeredMotionSensor(): void {
    this.services.triggeredMotionSensorService.updateCharacteristic(
      this.Characteristic.MotionDetected,
      true,
    );
    this.scheduleReset(this.services.triggeredMotionSensorService);
  }

  // ── Reset sensor ───────────────────────────────────────────────────────────

  pulseResetMotionSensor(): void {
    this.services.triggeredResetMotionSensorService.updateCharacteristic(
      this.Characteristic.MotionDetected,
      true,
    );
    this.scheduleReset(this.services.triggeredResetMotionSensorService);
    this.log.debug('Reset sensor (Triggered)');
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private scheduleReset(service: ServiceRegistry[keyof ServiceRegistry]): void {
    setTimeout(() => {
      service.updateCharacteristic(this.Characteristic.MotionDetected, false);
    }, SENSOR_PULSE_MS);
  }
}
