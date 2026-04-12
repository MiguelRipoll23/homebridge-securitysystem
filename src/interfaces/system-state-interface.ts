import type { ChildProcess } from 'child_process';
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
  invalidCodeCount: number;
  pausedCurrentState: SecurityState | null;
  audioProcess: ChildProcess | null;
}
