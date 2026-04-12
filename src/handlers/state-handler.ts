import type { Logging } from 'homebridge';
import type { CharacteristicConstructor } from '../interfaces/hap-types-interface.js';
import { SecurityState } from '../types/security-state-type.js';
import { OriginType } from '../types/origin-type.js';
import { stateToMode, capitalise } from '../utils/state-util.js';
import { modeToState } from '../utils/state-util.js';
import type { ServiceRegistry } from '../interfaces/service-registry-interface.js';
import type { SystemState } from '../interfaces/system-state-interface.js';
import type { SecuritySystemOptions } from '../interfaces/options-interface.js';
import type { EventBusService } from '../services/event-bus-service.js';
import { EventType } from '../types/event-type.js';
import type { StorageService } from '../services/storage-service.js';
import type { AudioService } from '../services/audio-service.js';
import type { TripHandler } from './trip-handler.js';
import type { SwitchHandler } from './switch-handler.js';
import type { SensorHandler } from './sensor-handler.js';

/** Manages the core security-system state machine: arming, triggering, and resetting. */
export class StateHandler {
  private tripHandler!: TripHandler;
  private switchHandler!: SwitchHandler;
  private sensorHandler!: SensorHandler;

  constructor(
    private readonly services: ServiceRegistry,
    private readonly state: SystemState,
    private readonly options: SecuritySystemOptions,
    private readonly Characteristic: CharacteristicConstructor,
    private readonly log: Logging,
    private readonly bus: EventBusService,
    private readonly storageService: StorageService,
    private readonly audio: AudioService,
  ) {}

  setHandlers(trip: TripHandler, sw: SwitchHandler, sensor: SensorHandler): void {
    this.tripHandler = trip;
    this.switchHandler = sw;
    this.sensorHandler = sensor;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  setCurrentState(state: SecurityState, origin: OriginType): void {
    this.sensorHandler.resetArmingMotionSensor();
    this.audio.play('current', state);

    if (this.state.currentState === state) {
      this.log.warn('Current mode (Already set)');
      return;
    }

    this.state.currentState = state;
    this.services.mainService.setCharacteristic(
      this.Characteristic.SecuritySystemCurrentState,
      state,
    );
    this.logMode('Current', state);

    this.handleCurrentStateChange(origin);
    this.storageService.save(this.state);
  }

  updateTargetState(state: SecurityState, origin: OriginType, delay: number): boolean {
    if (this.isBadTargetState(state)) {
      return false; 
    }

    this.state.targetState = state;
    this.logMode('Target', state);

    if (origin === OriginType.INTERNAL || origin === OriginType.EXTERNAL) {
      this.services.mainService.updateCharacteristic(
        this.Characteristic.SecuritySystemTargetState,
        state,
      );
    }

    this.handleTargetStateChange(origin);

    if (state === this.state.currentState) {
      this.setCurrentState(state, origin);
      return false;
    }

    const armSeconds = delay > 0 ? delay : 0;

    if (armSeconds === 0) {
      this.setCurrentState(state, origin);
      return false;
    }

    this.state.isArming = true;
    this.handleArmingState();
    this.log.info(`Arm delay (${armSeconds}s)`);

    this.state.armTimeout = setTimeout(() => {
      this.state.armTimeout = null;
      this.state.isArming = false;
      this.setCurrentState(state, origin);
    }, armSeconds * 1000);

    return true;
  }

  getArmingSeconds(state: SecurityState): number {
    const isTriggered = this.state.currentState === SecurityState.TRIGGERED;
    const isOff = state === SecurityState.OFF;

    if (isTriggered || isOff) {
      return 0; 
    }

    if (state === SecurityState.HOME && this.options.homeArmSeconds !== null) {
      return this.options.homeArmSeconds;
    }
    if (state === SecurityState.AWAY && this.options.awayArmSeconds !== null) {
      return this.options.awayArmSeconds;
    }
    if (state === SecurityState.NIGHT && this.options.nightArmSeconds !== null) {
      return this.options.nightArmSeconds;
    }

    return this.options.armSeconds;
  }

  resetTimers(): void {
    if (this.state.triggerTimeout) {
      clearTimeout(this.state.triggerTimeout);
      this.state.triggerTimeout = null;
      this.log.debug('Trigger timeout (Cleared)');
    }
    if (this.state.armTimeout) {
      clearTimeout(this.state.armTimeout);
      this.state.armTimeout = null;
      this.log.debug('Arming timeout (Cleared)');
    }
    if (this.state.triggeredMotionSensorInterval) {
      clearInterval(this.state.triggeredMotionSensorInterval);
      this.state.triggeredMotionSensorInterval = null;
      this.log.debug('Triggered interval (Cleared)');
    }
    if (this.state.trippedMotionSensorInterval) {
      clearInterval(this.state.trippedMotionSensorInterval);
      this.state.trippedMotionSensorInterval = null;
      this.log.debug('Tripped interval (Cleared)');
    }
    if (this.state.doubleKnockTimeout) {
      clearTimeout(this.state.doubleKnockTimeout);
      this.state.doubleKnockTimeout = null;
      this.log.debug('Double-knock timeout (Cleared)');
    }
    if (this.state.pauseTimeout) {
      clearTimeout(this.state.pauseTimeout);
      this.state.pauseTimeout = null;
      this.log.debug('Pause timeout (Cleared)');
    }
    if (this.state.resetTimeout) {
      clearTimeout(this.state.resetTimeout);
      this.state.resetTimeout = null;
      this.log.debug('Reset timeout (Cleared)');
    }
  }

  getAvailableTargetStates(): SecurityState[] {
    const all = [SecurityState.HOME, SecurityState.AWAY, SecurityState.NIGHT, SecurityState.OFF];
    const disabled = this.options.disabledModes.map(m => modeToState(m.toLowerCase()));
    return all.filter(s => !disabled.includes(s));
  }

  logMode(type: string, state: SecurityState | string): void {
    const mode = capitalise(stateToMode(state as SecurityState));
    this.log.info(`${type} mode (${mode})`);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private isBadTargetState(state: SecurityState): boolean {
    const isTriggered = this.state.currentState === SecurityState.TRIGGERED;
    const alreadySet = this.state.targetState === state;

    if (alreadySet && !isTriggered) {
      this.log.warn('Target mode (Already set)');
      return true;
    }

    if (!this.state.availableTargetStates.includes(state)) {
      this.log.warn('Target mode (Disabled)');
      return true;
    }

    const hasLock = this.options.armingLockSwitch || this.options.armingLockSwitches;
    if (state !== SecurityState.OFF && hasLock && this.switchHandler.isArmingLocked(state)) {
      this.log.warn('Arming lock (Not allowed)');
      return true;
    }

    return false;
  }

  private handleTargetStateChange(origin: OriginType): void {
    this.resetTimers();
    this.tripHandler.resetTripSwitches();
    this.sensorHandler.resetTrippedMotionSensor();
    this.switchHandler.resetModeSwitches();
    this.switchHandler.updateModeSwitches();

    this.bus.emit(EventType.TARGET_CHANGED, { state: this.state.targetState, origin });

    if (this.state.currentState === SecurityState.TRIGGERED) {
      this.sensorHandler.pulseResetMotionSensor();
    }

    this.state.isKnocked = false;
  }

  private handleCurrentStateChange(origin: OriginType): void {
    if (this.state.currentState === SecurityState.TRIGGERED) {
      this.handleTriggeredState();

      if (this.options.testMode) {
        return; 
      }
    }

    this.tripHandler.resetTripSwitches();
    this.bus.emit(EventType.CURRENT_CHANGED, { state: this.state.currentState, origin });
  }

  private handleTriggeredState(): void {
    if (this.state.trippedMotionSensorInterval) {
      clearInterval(this.state.trippedMotionSensorInterval);
      this.state.trippedMotionSensorInterval = null;
    }

    if (this.options.triggeredMotionSensor) {
      this.state.triggeredMotionSensorInterval = setInterval(
        () => this.sensorHandler.pulseTriggeredMotionSensor(),
        this.options.triggeredMotionSensorSeconds * 1000,
      );
    }

    this.state.resetTimeout = setTimeout(() => {
      this.state.resetTimeout = null;
      this.log.info('Reset (Finished)');
      this.sensorHandler.pulseResetMotionSensor();

      if (this.options.resetOffFlow) {
        this.resetViaOffMode();
      } else {
        this.setCurrentState(this.state.targetState, OriginType.EXTERNAL);
      }
    }, this.options.resetMinutes * 60 * 1000);
  }

  private handleArmingState(): void {
    this.sensorHandler.updateArmingMotionSensor(true);
    this.bus.emit(EventType.ARMING, { state: this.state.targetState });
  }

  private resetViaOffMode(): void {
    const original = this.state.targetState;
    this.updateTargetState(SecurityState.OFF, OriginType.INTERNAL, 0);

    setTimeout(() => {
      this.updateTargetState(original, OriginType.INTERNAL, this.getArmingSeconds(original));
    }, 100);
  }
}
