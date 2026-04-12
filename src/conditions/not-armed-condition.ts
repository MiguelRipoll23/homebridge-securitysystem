import { SecurityState } from '../types/security-state-type.js';
import { OriginType } from '../types/origin-type.js';
import type { ConditionContext } from '../interfaces/condition-context-interface.js';
import { Condition } from './condition.js';

/**
 * Blocks a trip action when the system is disarmed and neither
 * `override_off` nor the override switch is in use.
 */
export class NotArmedCondition extends Condition {
  readonly name = 'not-armed';

  evaluate({ state, options, value, origin }: ConditionContext): boolean {
    if (!value) {
      return false; 
    }

    const isDisarmed = state.currentState === SecurityState.OFF;
    const isNotOverridingOff = !options.overrideOff;
    const isNotOverrideSwitch = origin !== OriginType.OVERRIDE_SWITCH;

    return isDisarmed && isNotOverridingOff && isNotOverrideSwitch;
  }
}
