import type { SecurityState } from '../types/security-state-type.js';

/** Subset of SystemState that is persisted across Homebridge restarts. */
export interface PersistedState {
  currentState: SecurityState;
  targetState: SecurityState;
}
