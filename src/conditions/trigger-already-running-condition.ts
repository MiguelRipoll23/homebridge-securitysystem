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
    if (state.triggerTimeout !== null) {
      log.warn('Security System (Already tripped): trigger delay countdown is already running');
      return true;
    }
    return false;
  }
}
