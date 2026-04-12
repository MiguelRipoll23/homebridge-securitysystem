import type { ConditionContext } from '../interfaces/condition-context-interface.js';
import { Condition } from './condition.js';

/**
 * Blocks a trip action while the arm delay countdown is still running.
 * Prevents an intruder from tripping the system before it has fully armed.
 */
export class ArmingInProgressCondition extends Condition {
  readonly name = 'arming-in-progress';

  evaluate({ state, value }: ConditionContext): boolean {
    if (!value) {
      return false; 
    }
    return state.isArming;
  }
}
