import { EventEmitter } from 'events';
import { EventType } from '../types/event-type.js';
import type { EventPayloadMap } from '../types/event-payload-map-type.js';

/**
 * Typed event bus used to decouple side-effect services (audio, commands,
 * webhooks, storage) from the core state-machine handlers.
 */
export class EventBusService extends EventEmitter {
  emit<K extends EventType>(event: K, payload: EventPayloadMap[K]): boolean {
    return super.emit(event, payload);
  }

  on<K extends EventType>(event: K, listener: (payload: EventPayloadMap[K]) => void): this {
    return super.on(event, listener);
  }

  off<K extends EventType>(event: K, listener: (payload: EventPayloadMap[K]) => void): this {
    return super.off(event, listener);
  }
}
