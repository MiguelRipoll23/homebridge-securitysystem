import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventBusService } from '../services/event-bus-service.js';
import { EventType } from '../types/event-type.js';
import type { EventBusService as EventBusType } from '../services/event-bus-service.js';
import type { SensorStateChangedPayload } from '../types/event-type.js';
import { SensorHandler } from '../handlers/sensor-handler.js';
import { SENSOR_PULSE_MS } from '../constants/homekit-constant.js';

function makeLog() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
}

function recordedEvents(bus: EventBusType): SensorStateChangedPayload[] {
  const events: SensorStateChangedPayload[] = [];
  bus.on(EventType.SENSOR_STATE_CHANGED, payload => events.push(payload));
  return events;
}

describe('SensorHandler', () => {
  let bus: EventBusType;
  let handler: SensorHandler;

  beforeEach(() => {
    vi.useFakeTimers();
    bus = new EventBusService();
    handler = new SensorHandler(makeLog() as never, bus);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('updateArmingMotionSensor records the value and emits', () => {
    const events = recordedEvents(bus);

    handler.updateArmingMotionSensor(true);

    expect(handler.getMotionState('arming')).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ sensor: 'arming', value: true });
  });

  it('resetArmingMotionSensor only emits when the sensor is on', () => {
    const events = recordedEvents(bus);

    handler.resetArmingMotionSensor();
    expect(events).toHaveLength(0);

    handler.updateArmingMotionSensor(true);
    handler.resetArmingMotionSensor();

    expect(handler.getMotionState('arming')).toBe(false);
    expect(events).toEqual([
      { sensor: 'arming', value: true },
      { sensor: 'arming', value: false },
    ]);
  });

  it('setTrippedMotionSensor records the value and emits', () => {
    const events = recordedEvents(bus);

    handler.setTrippedMotionSensor(true);

    expect(handler.getMotionState('tripped')).toBe(true);
    expect(events[0]).toEqual({ sensor: 'tripped', value: true });
  });

  it('pulseTrippedMotionSensor turns the sensor on then resets it after the pulse', () => {
    const events = recordedEvents(bus);

    handler.pulseTrippedMotionSensor();
    expect(handler.getMotionState('tripped')).toBe(true);

    vi.advanceTimersByTime(SENSOR_PULSE_MS);

    expect(handler.getMotionState('tripped')).toBe(false);
    expect(events).toEqual([
      { sensor: 'tripped', value: true },
      { sensor: 'tripped', value: false },
    ]);
  });

  it('pulseResetMotionSensor turns the sensor on then resets it after the pulse', () => {
    const events = recordedEvents(bus);

    handler.pulseResetMotionSensor();
    expect(handler.getMotionState('reset')).toBe(true);

    vi.advanceTimersByTime(SENSOR_PULSE_MS);

    expect(handler.getMotionState('reset')).toBe(false);
    expect(events).toEqual([
      { sensor: 'reset', value: true },
      { sensor: 'reset', value: false },
    ]);
  });

  it('resetTrippedMotionSensor only emits when the sensor is on', () => {
    const events = recordedEvents(bus);

    handler.resetTrippedMotionSensor();
    expect(events).toHaveLength(0);

    handler.setTrippedMotionSensor(true);
    handler.resetTrippedMotionSensor();

    expect(handler.getMotionState('tripped')).toBe(false);
    expect(events).toHaveLength(2);
  });

  it('getMotionState starts at false for every sensor', () => {
    expect(handler.getMotionState('arming')).toBe(false);
    expect(handler.getMotionState('tripped')).toBe(false);
    expect(handler.getMotionState('reset')).toBe(false);
  });
});