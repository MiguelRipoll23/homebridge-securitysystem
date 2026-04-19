import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SecurityState } from '../types/security-state-type.js';
import { OriginType } from '../types/origin-type.js';
import type { SystemState } from '../interfaces/system-state-interface.js';
import type { SecuritySystemOptions } from '../interfaces/options-interface.js';
import type { ServiceRegistry } from '../interfaces/service-registry-interface.js';
import type { StorageService } from '../services/storage-service.js';
import type { AudioService } from '../services/audio-service.js';

// ── Minimal mocks ─────────────────────────────────────────────────────────────

function makeMockChar(initialValue: unknown = false) {
  const char = { value: initialValue, updateValue: vi.fn(), setProps: vi.fn() };
  char.updateValue.mockImplementation((v: unknown) => {
    char.value = v;
  });
  return char;
}

function makeMockService(charValue: unknown = false) {
  const char = makeMockChar(charValue);
  return {
    getCharacteristic: vi.fn().mockReturnValue(char),
    setCharacteristic: vi.fn().mockReturnThis(),
    updateCharacteristic: vi.fn(),
    addCharacteristic: vi.fn(),
    addOptionalCharacteristic: vi.fn(),
  };
}

function makeServices(): ServiceRegistry {
  const s = {} as Record<string, ReturnType<typeof makeMockService>>;
  const keys = [
    'mainService', 'accessoryInfoService', 'tripSwitchService', 'tripHomeSwitchService',
    'tripAwaySwitchService', 'tripNightSwitchService', 'tripOverrideSwitchService',
    'armingLockSwitchService', 'armingLockHomeSwitchService', 'armingLockAwaySwitchService',
    'armingLockNightSwitchService', 'modeHomeSwitchService', 'modeAwaySwitchService',
    'modeNightSwitchService', 'modeOffSwitchService', 'modeAwayExtendedSwitchService',
    'modePauseSwitchService', 'audioSwitchService', 'armingMotionSensorService',
    'trippedMotionSensorService', 'triggeredMotionSensorService', 'triggeredResetMotionSensorService',
  ];
  for (const k of keys) {
    s[k] = makeMockService();
  }
  return s as unknown as ServiceRegistry;
}

function makeState(overrides: Partial<SystemState> = {}): SystemState {
  return {
    currentState: SecurityState.OFF,
    targetState: SecurityState.OFF,
    defaultState: SecurityState.OFF,
    availableTargetStates: [SecurityState.HOME, SecurityState.AWAY, SecurityState.NIGHT, SecurityState.OFF],
    isArming: false,
    isTripping: false,
    isKnocked: false,
    serverAuthenticationAttempts: 0,
    pausedCurrentState: null,
    audioProcess: null,
    ...overrides,
  };
}

function makeOptions(overrides: Partial<SecuritySystemOptions> = {}): SecuritySystemOptions {
  return {
    armSeconds: 0,
    triggerSeconds: 0,
    resetMinutes: 10,
    testMode: false,
    proxyMode: false,
    saveState: false,
    armingLockSwitch: false,
    armingLockSwitches: false,
    disabledModes: [],
    homeArmSeconds: null,
    awayArmSeconds: null,
    nightArmSeconds: null,
    homeTriggerSeconds: null,
    awayTriggerSeconds: null,
    nightTriggerSeconds: null,
    triggeredMotionSensor: false,
    triggeredMotionSensorSeconds: 5,
    trippedMotionSensor: false,
    trippedMotionSensorSeconds: 5,
    resetOffFlow: false,
    ...overrides,
  } as unknown as SecuritySystemOptions;
}

function makeMockLog() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
}

function makeStorage() {
  return { save: vi.fn(), load: vi.fn(), init: vi.fn() } as unknown as StorageService;
}

function makeAudio() {
  return { play: vi.fn(), stop: vi.fn(), attachToBus: vi.fn() } as unknown as AudioService;
}

function makeTimers() {
  return {
    setArmTimer: vi.fn(), clearArmTimer: vi.fn(),
    setTriggerTimer: vi.fn(), clearTriggerTimer: vi.fn(), isTriggerRunning: vi.fn().mockReturnValue(false),
    setPauseTimer: vi.fn(), clearPauseTimer: vi.fn(),
    setDoubleKnockTimer: vi.fn(), clearDoubleKnockTimer: vi.fn(),
    setResetTimer: vi.fn(), clearResetTimer: vi.fn(),
    setTrippedInterval: vi.fn(), clearTrippedInterval: vi.fn(),
    setTriggeredInterval: vi.fn(), clearTriggeredInterval: vi.fn(),
    clearAll: vi.fn(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function makeMockSensor() {
  return {
    resetArmingMotionSensor: vi.fn(),
    resetTrippedMotionSensor: vi.fn(),
    pulseResetMotionSensor: vi.fn(),
    updateArmingMotionSensor: vi.fn(),
  };
}

// ── StateHandler tests ────────────────────────────────────────────────────────

describe('StateHandler.getArmingSeconds', async () => {
  const { StateHandler } = await import('../handlers/state-handler.js');

  let stateHandler: InstanceType<typeof StateHandler>;
  let state: SystemState;

  beforeEach(async () => {
    const { EventBusService } = await import('../services/event-bus-service.js');

    state = makeState();
    const services = makeServices();
    const options = makeOptions();
    const log = makeMockLog();
    const bus = new EventBusService();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sensor = makeMockSensor() as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stateHandler = new StateHandler(services, state, options, {} as any, log as any, bus, makeStorage(), makeAudio(), makeTimers(), sensor);
  });

  it('returns 0 when current state is TRIGGERED', () => {
    state.currentState = SecurityState.TRIGGERED;
    expect(stateHandler.getArmingSeconds(SecurityState.HOME)).toBe(0);
  });

  it('returns 0 when target state is OFF (disarm)', () => {
    state.currentState = SecurityState.HOME;
    expect(stateHandler.getArmingSeconds(SecurityState.OFF)).toBe(0);
  });

  it('returns global armSeconds when no mode-specific value', () => {
    state.currentState = SecurityState.HOME;
    expect(stateHandler.getArmingSeconds(SecurityState.AWAY)).toBe(0);
  });
});

// ── StateHandler.updateTargetState ───────────────────────────────────────────

describe('StateHandler.updateTargetState', async () => {
  const { StateHandler } = await import('../handlers/state-handler.js');
  const { EventBusService } = await import('../services/event-bus-service.js');

  it('returns failure when target state is already set (not triggered)', async () => {
    const state = makeState({ currentState: SecurityState.HOME, targetState: SecurityState.HOME });
    const log = makeMockLog();
    const bus = new EventBusService();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sensor = makeMockSensor() as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = new StateHandler(makeServices(), state, makeOptions(), {} as any, log as any, bus, makeStorage(), makeAudio(), makeTimers(), sensor);

    const result = handler.updateTargetState(SecurityState.HOME, OriginType.INTERNAL, 0);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('target mode is already set');
    expect(log.warn).toHaveBeenCalledWith('Target mode (Already set)');
  });

  it('transitions to a new armed mode', async () => {
    const state = makeState({ currentState: SecurityState.OFF, targetState: SecurityState.OFF });
    const log = makeMockLog();
    const bus = new EventBusService();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sensor = makeMockSensor() as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = new StateHandler(makeServices(), state, makeOptions(), {} as any, log as any, bus, makeStorage(), makeAudio(), makeTimers(), sensor);

    const result = handler.updateTargetState(SecurityState.HOME, OriginType.REGULAR_SWITCH, 0);
    expect(result.success).toBe(true);
    expect(state.targetState).toBe(SecurityState.HOME);
  });
});
