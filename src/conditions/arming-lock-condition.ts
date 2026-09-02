import { SecurityState } from '../types/security-state-type.js';
import type { ConditionContext } from '../interfaces/condition-context-interface.js';
import { Condition } from './condition.js';

/**
 * Blocks arming when an arming-lock switch (global or mode-specific) is active.
 * Does NOT block disarming.
 */
export class ArmingLockCondition extends Condition {
  readonly name = 'arming-lock';

  evaluate({ state, options }: ConditionContext): boolean {
    this.clearFailureReason();
    const hasLockFeature = options.armingLockSwitch || options.armingLockSwitches;
    if (!hasLockFeature) {
      return false;
    }

    const targetState = state.targetState;
    if (targetState === SecurityState.OFF) {
      return false;
    }

    // Check global arming-lock switch.
    if (state.armingLocks.global) {
      this._failureReason = 'arming is blocked by the global arming lock switch';
      return true;
    }

    // Check mode-specific arming-lock switch.
    let blocked = false;
    switch (targetState) {
    case SecurityState.HOME:
      blocked = state.armingLocks.home;
      break;
    case SecurityState.AWAY:
      blocked = state.armingLocks.away;
      break;
    case SecurityState.NIGHT:
      blocked = state.armingLocks.night;
      break;
    }

    if (blocked) {
      this._failureReason = 'arming is blocked by a mode-specific arming lock switch';
    }

    return blocked;
  }
}