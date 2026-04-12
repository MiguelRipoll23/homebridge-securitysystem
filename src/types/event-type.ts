import type { SecurityState } from './security-state-type.js';
import type { OriginType } from './origin-type.js';

/** All domain events emitted on the EventBusService. */
export enum EventType {
  TARGET_CHANGED = 'target-changed',
  CURRENT_CHANGED = 'current-changed',
  ARMING = 'arming',
  WARNING = 'warning',

  // Emitted by StateHandler before TARGET_CHANGED/CURRENT_CHANGED;
  // consumed by TripHandler and SwitchHandler to reset their own state.
  RESET_TRIP_SWITCHES = 'reset-trip-switches',
  RESET_MODE_SWITCHES = 'reset-mode-switches',
  UPDATE_MODE_SWITCHES = 'update-mode-switches',

  // Emitted by TripHandler; consumed by SecuritySystem which calls into StateHandler.
  TRIGGER_FIRED = 'trigger-fired',
  TRIP_CANCELLED = 'trip-cancelled',
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

export interface TriggerFiredPayload {
  origin: OriginType;
}

export interface TripCancelledPayload {
  origin: OriginType;
  stateChanged: boolean;
}

/** Empty payload for internal coordination events. */
export type EmptyPayload = Record<string, never>;
