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

  evaluate({ state, options, value, origin, log }: ConditionContext): boolean {
    this.clearFailureReason();
    if (!value) {
      return false;
    }

    const isDisarmed = state.currentState === SecurityState.OFF;
    const isNotOverridingOff = !options.overrideOff;
    const isNotOverrideSwitch = origin !== OriginType.OVERRIDE_SWITCH;

    const blocked = isDisarmed && isNotOverridingOff && isNotOverrideSwitch;
    if (blocked) {
      this._failureReason = 'Trip Switch (Not armed): system is disarmed and override is not enabled';
      log.warn(this._failureReason);
    }
    return blocked;
  }
}
