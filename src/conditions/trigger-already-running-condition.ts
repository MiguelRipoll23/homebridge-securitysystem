import type { ConditionContext } from '../interfaces/condition-context-interface.js';
import { Condition } from './condition.js';

/**
 * Blocks a trip activation when the trigger-delay countdown is already running.
 * Prevents stacking multiple trigger events during the pre-alarm window.
 */
export class TriggerAlreadyRunningCondition extends Condition {
  readonly name = 'trigger-already-running';

  evaluate({ state, value, log }: ConditionContext): boolean {
    if (!value) {
      return false;
    }
    if (state.isTripping) {
      this._failureReason = 'Security System (Already tripped): trigger delay countdown is already running';
      log.warn(this._failureReason);
      return true;
    }
    return false;
  }
}
