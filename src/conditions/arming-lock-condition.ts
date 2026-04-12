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
      return true; 
    }

    // Check mode-specific arming-lock switch.
    switch (targetState) {
    case SecurityState.HOME:
      return Boolean(services.armingLockHomeSwitchService.getCharacteristic(this.Characteristic.On).value);
    case SecurityState.AWAY:
      return Boolean(services.armingLockAwaySwitchService.getCharacteristic(this.Characteristic.On).value);
    case SecurityState.NIGHT:
      return Boolean(services.armingLockNightSwitchService.getCharacteristic(this.Characteristic.On).value);
    default:
      return false;
    }
  }
}
