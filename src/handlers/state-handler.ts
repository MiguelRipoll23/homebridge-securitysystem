import type { Logging } from 'homebridge';
import type { CharacteristicConstructor } from '../interfaces/hap-types-interface.js';
import { SecurityState } from '../types/security-state-type.js';
import { OriginType } from '../types/origin-type.js';
import { stateToMode, capitalise } from '../utils/state-util.js';
import { modeToState } from '../utils/state-util.js';
import type { ServiceRegistry, SingleServiceKey } from '../interfaces/service-registry-interface.js';
import type { SystemState } from '../interfaces/system-state-interface.js';
import type { SecuritySystemOptions } from '../interfaces/options-interface.js';
import type { EventBusService } from '../services/event-bus-service.js';
import { EventType } from '../types/event-type.js';
import type { StorageService } from '../services/storage-service.js';
import type { AudioService } from '../services/audio-service.js';
import type { SensorHandler } from './sensor-handler.js';
import type { TimerManager } from '../timers/timer-manager.js';
import { getArmingSeconds } from '../utils/arming-util.js';
import type { ServiceResult } from '../types/service-result-type.js';

/**
 * Manages the core security-system state machine: arming, triggering, and resetting.
 * Cross-handler side effects are signalled via the event bus so that this class has
 * no direct dependencies on TripHandler or SwitchHandler.
 */
export class StateHandler {
  constructor(
    private readonly services: ServiceRegistry,
    private readonly state: SystemState,
    private readonly options: SecuritySystemOptions,
    private readonly Characteristic: CharacteristicConstructor,
    private readonly log: Logging,
    private readonly bus: EventBusService,
    private readonly storageService: StorageService,
    private readonly audio: AudioService,
    private readonly timers: TimerManager,
    private readonly sensorHandler: SensorHandler,
  ) {}

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

  updateTargetState(state: SecurityState, origin: OriginType, delay: number): ServiceResult {
    // Same-target re-call: "confirm this mode externally; apply it now"
    if (state === this.state.targetState && this.state.currentState !== SecurityState.TRIGGERED) {
      if (state === this.state.currentState) {
        return { success: true };
      }

      if (this.state.isArming) {
        this.timers.clearArmTimer();
        this.state.isArming = false;
      }

      this.setCurrentState(state, origin);
      return { success: true };
    }

    const reason = this.getBadTargetStateReason(state);
    if (reason !== null) {
      return { success: false, reason };
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
      return { success: true };
    }

    const armSeconds = delay > 0 ? delay : 0;

    if (armSeconds === 0) {
      this.setCurrentState(state, origin);
      return { success: true };
    }

    this.state.isArming = true;
    this.handleArmingState();
    this.log.info(`Arm delay (${armSeconds}s)`);

    this.timers.setArmTimer(armSeconds * 1000, () => {
      this.state.isArming = false;
      this.setCurrentState(state, origin);
    });

    return { success: true };
  }

  getArmingSeconds(targetState: SecurityState): number {
    return getArmingSeconds(this.state, this.options, targetState);
  }

  resetTimers(): void {
    this.timers.clearAll();
  }

  /** Returns true while the trigger delay is counting down (trip switch is active). */
  isTripping(): boolean {
    return this.state.isTripping;
  }

  /** Checks whether arming is currently blocked by an arming-lock switch. */
  isArmingLocked(targetState: SecurityState): boolean {
    if (this.services.armingLockSwitchService.getCharacteristic(this.Characteristic.On).value) {
      return true;
    }

    const modeMap: Partial<Record<SecurityState, SingleServiceKey>> = {
      [SecurityState.HOME]: 'armingLockHomeSwitchService',
      [SecurityState.AWAY]: 'armingLockAwaySwitchService',
      [SecurityState.NIGHT]: 'armingLockNightSwitchService',
    };

    const svcKey = modeMap[targetState];
    return svcKey
      ? Boolean(this.services[svcKey].getCharacteristic(this.Characteristic.On).value)
      : false;
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

  /**
   * Returns a human-readable reason string if `state` is an invalid target,
   * or `null` if the transition is permitted.
   */
  private getBadTargetStateReason(state: SecurityState): string | null {
    const isTriggered = this.state.currentState === SecurityState.TRIGGERED;
    const alreadySet = this.state.targetState === state;

    if (alreadySet && !isTriggered) {
      this.log.warn('Target mode (Already set)');
      return 'target mode is already set';
    }

    if (!this.state.availableTargetStates.includes(state)) {
      this.log.warn('Target mode (Disabled)');
      return 'target mode is disabled';
    }

    const hasLock = this.options.armingLockSwitch || this.options.armingLockSwitches;
    if (state !== SecurityState.OFF && hasLock && this.isArmingLocked(state)) {
      this.log.warn('Arming lock (Not allowed)');
      return 'arming is blocked by an arming lock switch';
    }

    return null;
  }

  private handleTargetStateChange(origin: OriginType): void {
    this.resetTimers();

    // Notify handlers to reset their displayed state (bus is synchronous).
    this.bus.emit(EventType.RESET_TRIP_SWITCHES, {});
    this.sensorHandler.resetTrippedMotionSensor();
    this.bus.emit(EventType.RESET_MODE_SWITCHES, {});
    this.bus.emit(EventType.UPDATE_MODE_SWITCHES, {});

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

    // Notify TripHandler to reset trip switches on any state change.
    this.bus.emit(EventType.RESET_TRIP_SWITCHES, {});
    this.bus.emit(EventType.CURRENT_CHANGED, { state: this.state.currentState, origin });
  }

  private handleTriggeredState(): void {
    this.timers.clearTrippedInterval();

    if (this.options.triggeredMotionSensor) {
      this.timers.setTriggeredInterval(
        this.options.triggeredMotionSensorSeconds * 1000,
        () => this.sensorHandler.pulseTriggeredMotionSensor(),
      );
    }

    this.timers.setResetTimer(this.options.resetMinutes * 60 * 1000, () => {
      this.log.info('Reset (Finished)');
      this.sensorHandler.pulseResetMotionSensor();

      if (this.options.resetOffFlow) {
        this.resetViaOffMode();
      } else {
        this.setCurrentState(this.state.targetState, OriginType.EXTERNAL);
      }
    });
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
