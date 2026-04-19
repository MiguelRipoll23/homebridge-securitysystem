import type { ConditionContext } from '../interfaces/condition-context-interface.js';
import { Condition } from './condition.js';

/**
 * Blocks a trip action while the arm delay countdown is still running.
 * Prevents an intruder from tripping the system before it has fully armed.
 */
export class ArmingInProgressCondition extends Condition {
  readonly name = 'arming-in-progress';

  evaluate({ state, value, log }: ConditionContext): boolean {
    if (!value) {
      return false;
    }
    if (state.isArming) {
      this._failureReason = 'Trip Switch (Still arming): arm delay countdown is still in progress';
      log.warn(this._failureReason);
      return true;
    }
    return false;
  }
}
