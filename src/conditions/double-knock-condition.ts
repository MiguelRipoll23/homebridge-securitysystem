import { SecurityState } from '../types/security-state-type.js';
import { OriginType } from '../types/origin-type.js';
import type { ConditionContext } from '../interfaces/condition-context-interface.js';
import { modeToState } from '../utils/state-util.js';
import { Condition } from './condition.js';

/**
 * Implements the double-knock pattern: the first activation within a mode that
 * has double-knock enabled sets a "knocked" flag and rejects the trip. Only the
 * second activation within the configured window proceeds.
 *
 * The caller is responsible for managing `state.isKnocked` and the timeout
 * via the `onFirstKnock` callback injected at construction.
 */
export class DoubleKnockCondition extends Condition {
  readonly name = 'double-knock';

  /**
   * @param onFirstKnock Called when the first knock is detected.
   *   The callback receives the window duration in seconds and a reset function
   *   to invoke when the window expires.
   * @param onCancelTimer Called on the second knock to cancel the running window timer.
   */
  constructor(
    private readonly onFirstKnock: (seconds: number, onExpire: () => void) => void,
    private readonly onCancelTimer: () => void,
  ) {
    super();
  }

  evaluate({ state, options, value, origin, log }: ConditionContext): boolean {
    this.clearFailureReason();
    if (!value || !options.doubleKnock) {
      return false;
    }
    if (origin === OriginType.OVERRIDE_SWITCH) {
      return false;
    }
    if (state.isArming) {
      return false;
    }

    const knockableStates = options.doubleKnockModes.map(m => modeToState(m.toLowerCase()));
    if (!knockableStates.includes(state.currentState)) {
      return false;
    }

    if (state.isKnocked) {
      // Second knock — clear the flag and cancel the window timer, then allow through.
      state.isKnocked = false;
      this.onCancelTimer();
      return false;
    }

    // First knock — block and schedule expiry.
    state.isKnocked = true;
    const seconds = this.resolveWindow(state.currentState, options);

    this.onFirstKnock(seconds, () => {
      state.isKnocked = false;
      log.info('Trip Switch (Reset): double-knock window expired without second activation');
    });

    this._failureReason = 'Trip Switch (Knock): double-knock is required, waiting for second activation';
    log.warn(this._failureReason);
    return true;
  }

  private resolveWindow(
    currentState: SecurityState,
    options: ConditionContext['options'],
  ): number {
    if (currentState === SecurityState.HOME && options.homeDoubleKnockSeconds !== null) {
      return options.homeDoubleKnockSeconds;
    }
    if (currentState === SecurityState.AWAY && options.awayDoubleKnockSeconds !== null) {
      return options.awayDoubleKnockSeconds;
    }
    if (currentState === SecurityState.NIGHT && options.nightDoubleKnockSeconds !== null) {
      return options.nightDoubleKnockSeconds;
    }
    return options.doubleKnockSeconds;
  }
}
