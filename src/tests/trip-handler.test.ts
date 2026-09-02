import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SecurityState } from '../types/security-state-type.js';
import { OriginType } from '../types/origin-type.js';
import { EventType } from '../types/event-type.js';
import type { SystemState } from '../interfaces/system-state-interface.js';
import type { SecuritySystemOptions } from '../interfaces/options-interface.js';

function makeState(overrides: Partial<SystemState> = {}): SystemState {
  return {
    currentState: SecurityState.HOME,
    targetState: SecurityState.HOME,
    defaultState: SecurityState.OFF,
    availableTargetStates: [SecurityState.HOME, SecurityState.AWAY, SecurityState.NIGHT, SecurityState.OFF],
    isArming: false,
    isTripping: false,
    isKnocked: false,
    serverAuthenticationAttempts: 0,
    pausedCurrentState: null,
    armingLocks: { global: false, home: false, away: false, night: false },
    modeAwayExtended: false,
    ...overrides,
  };
}

function makeOptions(overrides: Partial<SecuritySystemOptions> = {}): SecuritySystemOptions {
  return {
    overrideOff: false,
    doubleKnock: false,
    doubleKnockSeconds: 90,
    doubleKnockModes: [],
    triggerSeconds: 0,
    homeTriggerSeconds: null,
    awayTriggerSeconds: null,
    nightTriggerSeconds: null,
    modeAwayExtendedSwitchTriggerSeconds: null,
    trippedMotionSensor: false,
    trippedMotionSensorSeconds: 5,
    homeDoubleKnockSeconds: null,
    awayDoubleKnockSeconds: null,
    nightDoubleKnockSeconds: null,
    ...overrides,
  } as unknown as SecuritySystemOptions;
}

// ── TripHandler tests ─────────────────────────────────────────────────────────

describe('TripHandler', async () => {
  const { TripHandler } = await import('../handlers/trip-handler.js');
  const { EventBusService } = await import('../services/event-bus-service.js');

  let state: SystemState;
  let bus: InstanceType<typeof EventBusService>;
  let tripHandler: any;
  const mockSensorHandler = {
    pulseTrippedMotionSensor: vi.fn(),
    setTrippedMotionSensor: vi.fn(),
    resetTrippedMotionSensor: vi.fn(),
  };
  const mockTimers = {
    setTriggerTimer: vi.fn(), clearTriggerTimer: vi.fn(), isTriggerRunning: vi.fn().mockReturnValue(false),
    setTrippedInterval: vi.fn(), clearTrippedInterval: vi.fn(),
    setDoubleKnockTimer: vi.fn(), clearDoubleKnockTimer: vi.fn(),
    clearAll: vi.fn(),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    state = makeState({ currentState: SecurityState.HOME });
    bus = new EventBusService();
    const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    tripHandler = new TripHandler(state, makeOptions(), mockLog as any, bus, mockSensorHandler as any, mockTimers);
  });

  it('blocks trip when system is disarmed (not overriding)', () => {
    state.currentState = SecurityState.OFF;
    const result = tripHandler.updateTripSwitch(true, OriginType.REGULAR_SWITCH, false);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('Trip Switch (Not armed): system is disarmed and override is not enabled');
  });

  it('blocks trip when arming is in progress', () => {
    state.isArming = true;
    const result = tripHandler.updateTripSwitch(true, OriginType.REGULAR_SWITCH, false);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('Trip Switch (Still arming): arm delay countdown is still in progress');
  });

  it('blocks trip when already triggered', () => {
    state.currentState = SecurityState.TRIGGERED;
    const result = tripHandler.updateTripSwitch(true, OriginType.REGULAR_SWITCH, false);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('Security System (Already triggered): alarm is already active');
  });

  it('blocks trip when trigger timeout is already running', () => {
    state.isTripping = true;
    const result = tripHandler.updateTripSwitch(true, OriginType.REGULAR_SWITCH, false);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('Security System (Already tripped): trigger delay countdown is already running');
    state.isTripping = false;
  });

  it('allows trip when system is armed (HOME mode)', () => {
    state.currentState = SecurityState.HOME;
    const result = tripHandler.updateTripSwitch(true, OriginType.REGULAR_SWITCH, false);
    expect(result.success).toBe(true);
  });

  describe('tripped motion sensor', () => {
    it('starts steady-on when trippedMotionSensorSeconds = 0', () => {
      const handler = new TripHandler(
        state,
        makeOptions({ trippedMotionSensor: true, trippedMotionSensorSeconds: 0 }),
        { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any,
        bus, mockSensorHandler as any, mockTimers,
      );

      handler.updateTripSwitch(true, OriginType.REGULAR_SWITCH, false);

      expect(mockSensorHandler.setTrippedMotionSensor).toHaveBeenCalledWith(true);
      expect(mockSensorHandler.pulseTrippedMotionSensor).not.toHaveBeenCalled();
      expect(mockTimers.setTrippedInterval).not.toHaveBeenCalled();
    });

    it('pulses with interval when trippedMotionSensorSeconds > 0', () => {
      const handler = new TripHandler(
        state,
        makeOptions({ trippedMotionSensor: true, trippedMotionSensorSeconds: 10 }),
        { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any,
        bus, mockSensorHandler as any, mockTimers,
      );

      handler.updateTripSwitch(true, OriginType.REGULAR_SWITCH, false);

      expect(mockSensorHandler.pulseTrippedMotionSensor).toHaveBeenCalled();
      expect(mockTimers.setTrippedInterval).toHaveBeenCalledWith(10000, expect.any(Function));
      expect(mockSensorHandler.setTrippedMotionSensor).not.toHaveBeenCalled();
    });

    it('resets tripped sensor on cancelTrip', () => {
      const handler = new TripHandler(
        state,
        makeOptions({ trippedMotionSensor: true }),
        { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any,
        bus, mockSensorHandler as any, mockTimers,
      );

      handler.updateTripSwitch(false, OriginType.REGULAR_SWITCH, false);

      expect(mockSensorHandler.resetTrippedMotionSensor).toHaveBeenCalled();
    });
  });

  it('cancels trip and emits TRIP_CANCELLED', () => {
    const emitted: unknown[] = [];
    bus.on(EventType.TRIP_CANCELLED, (payload) => emitted.push(payload));

    tripHandler.updateTripSwitch(false, OriginType.REGULAR_SWITCH, false);

    expect(emitted).toHaveLength(1);
  });

  it('emits TRIP_CANCELLED with stateChanged=false when trip cancelled while triggered', () => {
    state.currentState = SecurityState.TRIGGERED;
    let payload: any;
    bus.on(EventType.TRIP_CANCELLED, (p) => {
      payload = p;
    });

    tripHandler.updateTripSwitch(false, OriginType.REGULAR_SWITCH, false);

    expect(payload).toBeDefined();
    expect(payload.stateChanged).toBe(false);
  });

  it('emits TRIP_CANCELLED with stateChanged=true when state has changed', () => {
    state.currentState = SecurityState.TRIGGERED;
    let payload: any;
    bus.on(EventType.TRIP_CANCELLED, (p) => {
      payload = p;
    });

    tripHandler.updateTripSwitch(false, OriginType.INTERNAL, true);

    expect(payload).toBeDefined();
    expect(payload.stateChanged).toBe(true);
  });

  it('uses the extended trigger seconds when armed away-extended', () => {
    state.currentState = SecurityState.AWAY;
    state.modeAwayExtended = true;
    const handler = new TripHandler(
      state,
      makeOptions({ modeAwayExtendedSwitchTriggerSeconds: 45 }),
      { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any,
      bus, mockSensorHandler as any, mockTimers,
    );

    handler.updateTripSwitch(true, OriginType.REGULAR_SWITCH, false);

    expect(mockTimers.setTriggerTimer).toHaveBeenCalledWith(45000, expect.any(Function));
  });

  it('uses the regular away trigger seconds when not extended', () => {
    state.currentState = SecurityState.AWAY;
    const handler = new TripHandler(
      state,
      makeOptions({ modeAwayExtendedSwitchTriggerSeconds: 45, awayTriggerSeconds: 10 }),
      { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any,
      bus, mockSensorHandler as any, mockTimers,
    );

    handler.updateTripSwitch(true, OriginType.REGULAR_SWITCH, false);

    expect(mockTimers.setTriggerTimer).toHaveBeenCalledWith(10000, expect.any(Function));
  });

  it('triggerIfModeSet allows when current mode matches required', () => {
    state.currentState = SecurityState.HOME;
    const result = tripHandler.triggerIfModeSet(SecurityState.HOME, true);
    expect(result.success).toBe(true);
  });

  it('triggerIfModeSet blocks when current mode does not match', () => {
    state.currentState = SecurityState.AWAY;
    const result = tripHandler.triggerIfModeSet(SecurityState.HOME, true);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('mode not set');
  });

  it('triggerIfModeSet allows a trip while triggered when the target matches', () => {
    state.currentState = SecurityState.TRIGGERED;
    state.targetState = SecurityState.HOME;
    const result = tripHandler.triggerIfModeSet(SecurityState.HOME, true);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('Security System (Already triggered): alarm is already active');
  });

  it('custom trip switch cancellation works with triggerIfModeSet', () => {
    state.currentState = SecurityState.HOME;
    const result = tripHandler.triggerIfModeSet(SecurityState.HOME, false);
    expect(result.success).toBe(true);
  });
});