import { EventType } from './event-type.js';
import type {
  TargetChangedPayload,
  CurrentChangedPayload,
  ArmingPayload,
  WarningPayload,
  TriggerFiredPayload,
  TripCancelledPayload,
  EmptyPayload,
} from './event-type.js';

/** Maps each EventType to the payload type emitted with it. */
export type EventPayloadMap = {
  [EventType.TARGET_CHANGED]: TargetChangedPayload;
  [EventType.CURRENT_CHANGED]: CurrentChangedPayload;
  [EventType.ARMING]: ArmingPayload;
  [EventType.WARNING]: WarningPayload;
  [EventType.RESET_TRIP_SWITCHES]: EmptyPayload;
  [EventType.RESET_MODE_SWITCHES]: EmptyPayload;
  [EventType.UPDATE_MODE_SWITCHES]: EmptyPayload;
  [EventType.TRIGGER_FIRED]: TriggerFiredPayload;
  [EventType.TRIP_CANCELLED]: TripCancelledPayload;
};
