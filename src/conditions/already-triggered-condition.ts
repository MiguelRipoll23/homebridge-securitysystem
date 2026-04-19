import { SecurityState } from '../types/security-state-type.js';
import type { ConditionContext } from '../interfaces/condition-context-interface.js';
import { Condition } from './condition.js';

/**
 * Blocks a new trip activation when the alarm has already been triggered.
 * Prevents stacking multiple trigger events on an active alarm.
 */
export class AlreadyTriggeredCondition extends Condition {
  readonly name = 'already-triggered';

  evaluate({ state, value, log }: ConditionContext): boolean {
    this.clearFailureReason();
    if (!value) {
      return false;
    }
    const blocked = state.currentState === SecurityState.TRIGGERED;
    if (blocked) {
      this._failureReason = 'Security System (Already triggered): alarm is already active';
      log.warn(this._failureReason);
    }
    return blocked;
  }
}
