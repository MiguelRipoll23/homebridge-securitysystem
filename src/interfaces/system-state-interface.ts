import type { ChildProcess } from 'child_process';
import type { SecurityState } from '../types/security-state-type.js';

/** Mutable runtime state shared across all handlers. */
export interface SystemState {
  currentState: SecurityState;
  targetState: SecurityState;
  defaultState: SecurityState;
  availableTargetStates: SecurityState[];

  isArming: boolean;
  isKnocked: boolean;
  invalidCodeCount: number;
  pausedCurrentState: SecurityState | null;
  audioProcess: ChildProcess | null;

  // Active timers (null = not running)
  armTimeout: ReturnType<typeof setTimeout> | null;
  pauseTimeout: ReturnType<typeof setTimeout> | null;
  triggerTimeout: ReturnType<typeof setTimeout> | null;
  doubleKnockTimeout: ReturnType<typeof setTimeout> | null;
  resetTimeout: ReturnType<typeof setTimeout> | null;
  trippedMotionSensorInterval: ReturnType<typeof setInterval> | null;
  triggeredMotionSensorInterval: ReturnType<typeof setInterval> | null;
}
