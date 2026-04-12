import { SecurityState } from '../types/security-state-type.js';
import type { Mode } from '../types/mode-type.js';

/** Converts a SecurityState value to its human-readable mode string. */
export function stateToMode(state: SecurityState | string): Mode {
  switch (state) {
  case SecurityState.TRIGGERED: return 'triggered';
  case SecurityState.HOME: return 'home';
  case SecurityState.AWAY: return 'away';
  case SecurityState.NIGHT: return 'night';
  case SecurityState.OFF: return 'off';
  case 'lock': return 'lock';
  case 'warning': return 'warning';
  default: return 'unknown';
  }
}

/** Converts a mode string to its corresponding SecurityState value (-1 if unknown). */
export function modeToState(mode: string): SecurityState {
  switch (mode) {
  case 'home': return SecurityState.HOME;
  case 'away': return SecurityState.AWAY;
  case 'night': return SecurityState.NIGHT;
  case 'off': return SecurityState.OFF;
  default: return -1 as SecurityState;
  }
}

/** Capitalises the first letter of a string. */
export function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
