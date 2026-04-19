import type { Logging } from 'homebridge';
import type { CharacteristicConstructor } from '../interfaces/hap-types-interface.js';
import { SecurityState } from '../types/security-state-type.js';
import { HK_NOT_ALLOWED_IN_CURRENT_STATE } from '../constants/homekit-constant.js';
import type { ServiceRegistry, SingleServiceKey } from '../interfaces/service-registry-interface.js';
import type { SystemState } from '../interfaces/system-state-interface.js';
import type { SecuritySystemOptions } from '../interfaces/options-interface.js';
import type { StateHandler } from './state-handler.js';
import { OriginType } from '../types/origin-type.js';
import { capitalise } from '../utils/state-util.js';
import type { TimerManager } from '../timers/timer-manager.js';
import type { EventBusService } from '../services/event-bus-service.js';
import { EventType } from '../types/event-type.js';
import type { ServiceResult } from '../types/service-result-type.js';

/**
 * Handles all mode switches and the pause/extended switches.
 * Calls StateHandler directly (one-way dependency — no cycle).
 * Subscribes to bus events emitted by StateHandler to reset its own display state.
 */
export class SwitchHandler {
  constructor(
    private readonly services: ServiceRegistry,
    private readonly state: SystemState,
    private readonly options: SecuritySystemOptions,
    private readonly Characteristic: CharacteristicConstructor,
    private readonly log: Logging,
    private readonly timers: TimerManager,
    private readonly stateHandler: StateHandler,
  ) {}

  /** Register bus listeners so StateHandler can signal display resets without importing this class. */
  subscribeToStateEvents(bus: EventBusService): void {
    bus.on(EventType.RESET_MODE_SWITCHES, () => this.resetModeSwitches());
    bus.on(EventType.UPDATE_MODE_SWITCHES, () => this.updateModeSwitches());
  }

  // ── Mode switches ──────────────────────────────────────────────────────────

  setModeSwitch(mode: SecurityState, value: boolean): number | null {
    if (!value) {
      return HK_NOT_ALLOWED_IN_CURRENT_STATE;
    }
    const delay = this.stateHandler.getArmingSeconds(mode);
    this.stateHandler.updateTargetState(mode, OriginType.INTERNAL, delay);
    return null;
  }

  setModeOffSwitch(value: boolean): number | null {
    if (!value) {
      return HK_NOT_ALLOWED_IN_CURRENT_STATE;
    }
    this.stateHandler.updateTargetState(SecurityState.OFF, OriginType.INTERNAL, 0);
    return null;
  }

  setModeAwayExtendedSwitch(value: boolean): number | null {
    if (!value) {
      return HK_NOT_ALLOWED_IN_CURRENT_STATE;
    }
    const delay = this.stateHandler.getArmingSeconds(SecurityState.AWAY);
    this.stateHandler.updateTargetState(SecurityState.AWAY, OriginType.INTERNAL, delay);
    return null;
  }

  setModePauseSwitch(value: boolean): number | null {
    if (this.state.currentState === SecurityState.TRIGGERED) {
      this.log.warn('Mode pause (Alarm is triggered)');
      return HK_NOT_ALLOWED_IN_CURRENT_STATE;
    }

    if (value) {
      if (this.state.currentState === SecurityState.OFF) {
        this.log.warn('Mode pause (Not armed)');
        return HK_NOT_ALLOWED_IN_CURRENT_STATE;
      }

      this.log.info('Mode pause (Started)');
      this.state.pausedCurrentState = this.state.currentState;
      this.stateHandler.updateTargetState(SecurityState.OFF, OriginType.INTERNAL, 0);

      if (this.options.pauseMinutes !== 0) {
        this.timers.setPauseTimer(this.options.pauseMinutes * 60 * 1000, () => {
          this.log.info('Mode pause (Finished)');
          const prev = this.state.pausedCurrentState ?? this.state.defaultState;
          this.stateHandler.updateTargetState(prev, OriginType.INTERNAL, this.stateHandler.getArmingSeconds(prev));
        });
      }
    } else {
      this.log.info('Mode pause (Cancelled)');
      this.timers.clearPauseTimer();

      const prev = this.state.pausedCurrentState ?? this.state.defaultState;
      this.stateHandler.updateTargetState(prev, OriginType.INTERNAL, this.stateHandler.getArmingSeconds(prev));
    }

    return null;
  }

  // ── Arming lock switches ───────────────────────────────────────────────────

  updateArmingLock(mode: string, value: boolean): ServiceResult {
    this.logArmingLock(mode, value);

    const map: Record<string, SingleServiceKey> = {
      global: 'armingLockSwitchService',
      home: 'armingLockHomeSwitchService',
      away: 'armingLockAwaySwitchService',
      night: 'armingLockNightSwitchService',
    };

    const key = map[mode];
    if (!key) {
      this.log.debug(`Unknown arming lock mode (${mode})`);
      return { success: false, reason: `unknown arming lock mode: ${mode}` };
    }

    this.services[key].getCharacteristic(this.Characteristic.On).updateValue(value);
    return { success: true };
  }

  // ── Mode switch display ────────────────────────────────────────────────────

  resetModeSwitches(): void {
    const switches: Array<SingleServiceKey> = [
      'modeHomeSwitchService', 'modeAwaySwitchService', 'modeNightSwitchService',
      'modeOffSwitchService', 'modeAwayExtendedSwitchService', 'modePauseSwitchService',
    ];

    for (const key of switches) {
      const char = this.services[key].getCharacteristic(this.Characteristic.On);
      if (char.value) {
        char.updateValue(false);
        this.log.debug(`${key} (Off)`);
      }
    }
  }

  updateModeSwitches(): void {
    const modeMap: Partial<Record<SecurityState, SingleServiceKey>> = {
      [SecurityState.HOME]: 'modeHomeSwitchService',
      [SecurityState.AWAY]: 'modeAwaySwitchService',
      [SecurityState.NIGHT]: 'modeNightSwitchService',
      [SecurityState.OFF]: 'modeOffSwitchService',
    };

    const key = modeMap[this.state.targetState];
    if (key) {
      this.services[key].updateCharacteristic(this.Characteristic.On, true);
      this.log.debug(`${key} (On)`);
    }
  }

  private logArmingLock(mode: string, value: boolean): void {
    this.log.info(`Arming lock [${capitalise(mode)}] (${value ? 'On' : 'Off'})`);
  }
}
