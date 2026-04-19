import { SecurityState } from '../types/security-state-type.js';
import type { ConditionContext } from '../interfaces/condition-context-interface.js';
import type { CharacteristicConstructor } from '../interfaces/hap-types-interface.js';
import { Condition } from './condition.js';

/**
 * Blocks arming when an arming-lock switch (global or mode-specific) is active.
 * Does NOT block disarming.
 */
export class ArmingLockCondition extends Condition {
  readonly name = 'arming-lock';

  constructor(private readonly Characteristic: CharacteristicConstructor) {
    super();
  }

  evaluate({ state, services, options }: ConditionContext): boolean {
    const hasLockFeature = options.armingLockSwitch || options.armingLockSwitches;
    if (!hasLockFeature) {
      return false;
    }

    const targetState = state.targetState;
    if (targetState === SecurityState.OFF) {
      return false;
    }

    // Check global arming-lock switch.
    const globalOn = services.armingLockSwitchService
      .getCharacteristic(this.Characteristic.On).value;

    if (globalOn) {
      this._failureReason = 'arming is blocked by the global arming lock switch';
      return true;
    }

    // Check mode-specific arming-lock switch.
    let blocked = false;
    switch (targetState) {
    case SecurityState.HOME:
      blocked = Boolean(services.armingLockHomeSwitchService.getCharacteristic(this.Characteristic.On).value);
      break;
    case SecurityState.AWAY:
      blocked = Boolean(services.armingLockAwaySwitchService.getCharacteristic(this.Characteristic.On).value);
      break;
    case SecurityState.NIGHT:
      blocked = Boolean(services.armingLockNightSwitchService.getCharacteristic(this.Characteristic.On).value);
      break;
    }

    if (blocked) {
      this._failureReason = 'arming is blocked by a mode-specific arming lock switch';
    }

    return blocked;
  }
}
