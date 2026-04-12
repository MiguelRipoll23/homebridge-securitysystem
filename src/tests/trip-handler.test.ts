import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SecurityState } from '../types/security-state-type.js';
import { OriginType } from '../types/origin-type.js';
import type { SystemState } from '../interfaces/system-state-interface.js';
import type { SecuritySystemOptions } from '../interfaces/options-interface.js';
import type { ServiceRegistry } from '../interfaces/service-registry-interface.js';

// ── Helpers (shared with state-handler.test) ──────────────────────────────────

function makeMockChar(value: unknown = false) {
  const c = { value, updateValue: vi.fn() };
  c.updateValue.mockImplementation((v: unknown) => {
    c.value = v; 
  });
  return c;
}

function makeMockService(charValue: unknown = false) {
  const char = makeMockChar(charValue);
  return {
    getCharacteristic: vi.fn().mockReturnValue(char),
    updateCharacteristic: vi.fn(),
    setCharacteristic: vi.fn().mockReturnThis(),
    addCharacteristic: vi.fn(),
    addOptionalCharacteristic: vi.fn(),
  };
}

function makeServices(): ServiceRegistry {
  const keys = [
    'mainService', 'tripSwitchService', 'tripHomeSwitchService', 'tripAwaySwitchService',
    'tripNightSwitchService', 'tripOverrideSwitchService', 'armingLockSwitchService',
    'armingLockHomeSwitchService', 'armingLockAwaySwitchService', 'armingLockNightSwitchService',
    'modeHomeSwitchService', 'modeAwaySwitchService', 'modeNightSwitchService',
    'modeOffSwitchService', 'modeAwayExtendedSwitchService', 'modePauseSwitchService',
    'audioSwitchService', 'armingMotionSensorService', 'trippedMotionSensorService',
    'triggeredMotionSensorService', 'triggeredResetMotionSensorService', 'accessoryInfoService',
  ];
  const s: Record<string, ReturnType<typeof makeMockService>> = {};
  for (const k of keys) {
    s[k] = makeMockService(); 
  }
  return s as unknown as ServiceRegistry;
}

function makeState(overrides: Partial<SystemState> = {}): SystemState {
  return {
    currentState: SecurityState.HOME,
    targetState: SecurityState.HOME,
    defaultState: SecurityState.OFF,
    availableTargetStates: [SecurityState.HOME, SecurityState.AWAY, SecurityState.NIGHT, SecurityState.OFF],
    isArming: false,
    isKnocked: false,
    invalidCodeCount: 0,
    pausedCurrentState: null,
    audioProcess: null,
    armTimeout: null,
    pauseTimeout: null,
    triggerTimeout: null,
    doubleKnockTimeout: null,
    resetTimeout: null,
    trippedMotionSensorInterval: null,
    triggeredMotionSensorInterval: null,
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
  let services: ServiceRegistry;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tripHandler: any;
  const mockStateHandler = {
    setCurrentState: vi.fn(),
    updateTargetState: vi.fn(),
    resetTimers: vi.fn(),
    getArmingSeconds: vi.fn().mockReturnValue(0),
  };
  const mockSensorHandler = {
    pulseTrippedMotionSensor: vi.fn(),
    resetTrippedMotionSensor: vi.fn(),
  };
  const mockAudio = { stop: vi.fn(), play: vi.fn(), attachToBus: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    state = makeState({ currentState: SecurityState.HOME });
    services = makeServices();
    const bus = new EventBusService();
    const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tripHandler = new TripHandler(services, state, makeOptions(), {} as any, mockLog as any, bus, mockAudio as any, mockSensorHandler as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tripHandler.setStateHandler(mockStateHandler as any);
  });

  it('blocks trip when system is disarmed (not overriding)', () => {
    state.currentState = SecurityState.OFF;
    const result = tripHandler.updateTripSwitch(true, OriginType.REGULAR_SWITCH, false);
    expect(result).toBe(false);
  });

  it('blocks trip when arming is in progress', () => {
    state.isArming = true;
    const result = tripHandler.updateTripSwitch(true, OriginType.REGULAR_SWITCH, false);
    expect(result).toBe(false);
  });

  it('blocks trip when already triggered', () => {
    state.currentState = SecurityState.TRIGGERED;
    const result = tripHandler.updateTripSwitch(true, OriginType.REGULAR_SWITCH, false);
    expect(result).toBe(false);
  });

  it('blocks trip when trigger timeout is already running', () => {
    state.triggerTimeout = setTimeout(() => {}, 99999);
    const result = tripHandler.updateTripSwitch(true, OriginType.REGULAR_SWITCH, false);
    expect(result).toBe(false);
    clearTimeout(state.triggerTimeout!);
  });

  it('allows trip when system is armed (HOME mode)', () => {
    state.currentState = SecurityState.HOME;
    const result = tripHandler.updateTripSwitch(true, OriginType.REGULAR_SWITCH, false);
    expect(result).toBe(true);
  });

  it('cancels trip and stops audio', () => {
    tripHandler.updateTripSwitch(false, OriginType.REGULAR_SWITCH, false);
    expect(mockAudio.stop).toHaveBeenCalled();
    expect(mockStateHandler.resetTimers).toHaveBeenCalled();
  });

  it('disarms when trip cancelled while triggered and stateChanged=false', () => {
    state.currentState = SecurityState.TRIGGERED;
    tripHandler.updateTripSwitch(false, OriginType.REGULAR_SWITCH, false);
    expect(mockStateHandler.updateTargetState).toHaveBeenCalledWith(SecurityState.OFF, OriginType.INTERNAL, 0);
  });

  it('does not disarm when stateChanged=true', () => {
    state.currentState = SecurityState.TRIGGERED;
    tripHandler.updateTripSwitch(false, OriginType.INTERNAL, true);
    expect(mockStateHandler.updateTargetState).not.toHaveBeenCalled();
  });

  it('triggerIfModeSet allows when current mode matches required', () => {
    state.currentState = SecurityState.HOME;
    const result = tripHandler.triggerIfModeSet(SecurityState.HOME, true);
    expect(result).toBe(true);
  });

  it('triggerIfModeSet blocks when current mode does not match', () => {
    state.currentState = SecurityState.AWAY;
    const result = tripHandler.triggerIfModeSet(SecurityState.HOME, true);
    expect(result).toBe(false);
  });
});
