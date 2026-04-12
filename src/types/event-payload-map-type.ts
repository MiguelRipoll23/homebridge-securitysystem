import { EventType } from './event-type.js';
import type {
  TargetChangedPayload,
  CurrentChangedPayload,
  ArmingPayload,
  WarningPayload,
} from './event-type.js';

/** Maps each EventType to the payload type emitted with it. */
export type EventPayloadMap = {
  [EventType.TARGET_CHANGED]: TargetChangedPayload;
  [EventType.CURRENT_CHANGED]: CurrentChangedPayload;
  [EventType.ARMING]: ArmingPayload;
  [EventType.WARNING]: WarningPayload;
};
