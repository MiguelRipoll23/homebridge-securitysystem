import type { SecurityState } from '../types/security-state-type.js';

/** Mutable runtime state shared across all handlers. */
export interface SystemState {
  currentState: SecurityState;
  targetState: SecurityState;
  defaultState: SecurityState;
  availableTargetStates: SecurityState[];

  isArming: boolean;
  isTripping: boolean;
  isKnocked: boolean;
  serverAuthenticationAttempts: number;
  pausedCurrentState: SecurityState | null;

  /** Arming-lock switch state. Switches are Matter-only, so the lock state lives here (was held by HAP characteristics). */
  armingLocks: {
    global: boolean;
    home: boolean;
    away: boolean;
    night: boolean;
  };
  /** True while armed away via the away-extended switch; resets on any target state change. */
  modeAwayExtended: boolean;
}
