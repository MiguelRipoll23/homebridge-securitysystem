import type { ConditionContext } from '../interfaces/condition-context-interface.js';

/**
 * Base class for all conditions that can block a trip/trigger action.
 *
 * Extend this class and implement `evaluate()` to return `true` when the
 * condition should prevent the action from proceeding. Set `_failureReason`
 * before returning `true` so callers can retrieve it via `failureReason`.
 */
export abstract class Condition {
  abstract readonly name: string;

  protected _failureReason: string | undefined;

  /** Returns the reason the condition blocked the last evaluated action, if any. */
  get failureReason(): string | undefined {
    return this._failureReason;
  }

  /** Must be called at the top of every evaluate() implementation to clear any stale reason. */
  protected clearFailureReason(): void {
    this._failureReason = undefined;
  }

  /**
   * Returns `true` if this condition blocks the action described by `context`.
   * When `true` is returned the caller must reject the HomeKit request.
   * Implementations must call `this.clearFailureReason()` before any allow/deny logic.
   */
  abstract evaluate(context: ConditionContext): boolean;
}
