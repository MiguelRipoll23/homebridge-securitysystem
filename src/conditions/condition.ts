import type { ConditionContext } from '../interfaces/condition-context-interface.js';

/**
 * Base class for all conditions that can block a trip/trigger action.
 *
 * Extend this class and implement `evaluate()` to return `true` when the
 * condition should prevent the action from proceeding.
 */
export abstract class Condition {
  abstract readonly name: string;

  /**
   * Returns `true` if this condition blocks the action described by `context`.
   * When `true` is returned the caller must reject the HomeKit request.
   */
  abstract evaluate(context: ConditionContext): boolean;
}
