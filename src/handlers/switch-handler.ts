import type { Logging } from 'homebridge';
import { SecurityState } from '../types/security-state-type.js';
import { OriginType } from '../types/origin-type.js';
import type { SystemState } from '../interfaces/system-state-interface.js';
import type { SecuritySystemOptions } from '../interfaces/options-interface.js';
import type { StateHandler } from './state-handler.js';
import { capitalise } from '../utils/state-util.js';
import type { TimerManager } from '../timers/timer-manager.js';
import type { ServiceResult } from '../types/service-result-type.js';

/**
 * Handles all mode switches and the pause/extended switches.
 * Switches are published over Matter only; the HAP layer no longer carries them,
 * so every method reports outcomes as ServiceResult which MatterService maps to
 * Matter status errors. The switch display state is pushed to Matter via bus
 * events handled by MatterService.
 */
export class SwitchHandler {
  constructor(
    private readonly state: SystemState,
    private readonly options: SecuritySystemOptions,
    private readonly log: Logging,
    private readonly timers: TimerManager,
    private readonly stateHandler: StateHandler,
  ) {}

  // ── Mode switches ──────────────────────────────────────────────────────────

  setModeSwitch(mode: SecurityState, value: boolean): ServiceResult {
    if (!value) {
      return { success: false, reason: 'a mode switch can only be turned on' };
    }
    const delay = this.stateHandler.getArmingSeconds(mode);
    return this.stateHandler.updateTargetState(mode, OriginType.INTERNAL, delay);
  }

  setModeOffSwitch(value: boolean): ServiceResult {
    if (!value) {
      return { success: false, reason: 'a mode switch can only be turned on' };
    }
    return this.stateHandler.updateTargetState(SecurityState.OFF, OriginType.INTERNAL, 0);
  }

  setModeAwayExtendedSwitch(value: boolean): ServiceResult {
    if (!value) {
      return { success: false, reason: 'the away-extended switch can only be turned on' };
    }
    const delay = this.stateHandler.getArmingSeconds(SecurityState.AWAY);
    const result = this.stateHandler.updateTargetState(SecurityState.AWAY, OriginType.INTERNAL, delay);
    if (result.success) {
      this.state.modeAwayExtended = true;
    }
    return result;
  }

  setModePauseSwitch(value: boolean): ServiceResult {
    if (this.state.currentState === SecurityState.TRIGGERED) {
      this.log.warn('Mode pause (Alarm is triggered)');
      return { success: false, reason: 'mode pause is not allowed while the alarm is triggered' };
    }

    if (value) {
      if (this.state.currentState === SecurityState.OFF) {
        this.log.warn('Mode pause (Not armed)');
        return { success: false, reason: 'mode pause is not allowed while disarmed' };
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

    return { success: true };
  }

  // ── Arming lock switches ───────────────────────────────────────────────────

  updateArmingLock(mode: string, value: boolean): ServiceResult {
    this.logArmingLock(mode, value);

    const locks = this.state.armingLocks;
    const key: keyof typeof locks | undefined = ['global', 'home', 'away', 'night']
      .find(candidate => candidate === mode) as keyof typeof locks | undefined;

    if (!key) {
      this.log.debug(`Unknown arming lock mode (${mode})`);
      return { success: false, reason: `unknown arming lock mode: ${mode}` };
    }

    locks[key] = value;
    return { success: true };
  }

  private logArmingLock(mode: string, value: boolean): void {
    this.log.info(`Arming lock [${capitalise(mode)}] (${value ? 'On' : 'Off'})`);
  }
}