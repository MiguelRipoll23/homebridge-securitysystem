import type { SecurityState } from './security-state-type.js';
import type { OriginType } from './origin-type.js';

/** All domain events emitted on the EventBusService. */
export enum EventType {
  TARGET_CHANGED = 'target-changed',
  CURRENT_CHANGED = 'current-changed',
  ARMING = 'arming',
  WARNING = 'warning',
}

export interface TargetChangedPayload {
  state: SecurityState;
  origin: OriginType;
}

export interface CurrentChangedPayload {
  state: SecurityState;
  origin: OriginType;
}

export interface ArmingPayload {
  state: SecurityState;
}

export interface WarningPayload {
  origin: OriginType;
  triggerSeconds: number;
}
