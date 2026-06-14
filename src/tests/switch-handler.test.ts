import { describe, it, expect, vi } from 'vitest';
import { SecurityState } from '../types/security-state-type.js';
import type { SystemState } from '../interfaces/system-state-interface.js';
import type { SecuritySystemOptions } from '../interfaces/options-interface.js';
import type { ServiceRegistry } from '../interfaces/service-registry-interface.js';

// ── Minimal mocks ─────────────────────────────────────────────────────────────

function makeMockCharacteristic(value: unknown = false) {
  const characteristic = { value, updateValue: vi.fn(), setProps: vi.fn() };
  characteristic.updateValue.mockImplementation((v: unknown) => {
    characteristic.value = v;
  });
  return characteristic;
}

function makeMockService(characteristicValue: unknown = false) {
  const characteristic = makeMockCharacteristic(characteristicValue);
  const service = {
    getCharacteristic: vi.fn().mockReturnValue(characteristic),
    updateCharacteristic: vi.fn((_name: unknown, value: unknown) => {
      characteristic.value = value;
      return service;
    }),
    setCharacteristic: vi.fn().mockReturnThis(),
    addCharacteristic: vi.fn(),
    addOptionalCharacteristic: vi.fn(),
  };
  return service;
}

function makeServices(): ServiceRegistry {
  const keys = [
    'mainService', 'accessoryInfoService', 'tripSwitchService', 'tripHomeSwitchService',
    'tripAwaySwitchService', 'tripNightSwitchService', 'tripOverrideSwitchService',
    'armingLockSwitchService', 'armingLockHomeSwitchService', 'armingLockAwaySwitchService',
    'armingLockNightSwitchService', 'modeHomeSwitchService', 'modeAwaySwitchService',
    'modeNightSwitchService', 'modeOffSwitchService', 'modeAwayExtendedSwitchService',
    'modePauseSwitchService', 'audioSwitchService', 'armingMotionSensorService',
    'trippedMotionSensorService', 'triggeredMotionSensorService', 'triggeredResetMotionSensorService',
  ];
  const registry: Record<string, ReturnType<typeof makeMockService> | unknown[]> = {};
  for (const key of keys) {
    registry[key] = makeMockService();
  }
  registry.customTripHomeSwitchServices = [];
  registry.customTripAwaySwitchServices = [];
  registry.customTripNightSwitchServices = [];
  return registry as unknown as ServiceRegistry;
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
    overrideOff: false,
    doubleKnock: false,
    doubleKnockSeconds: 90,
    doubleKnockModes: [],
    homeTriggerSeconds: null,
    awayTriggerSeconds: null,
    nightTriggerSeconds: null,
    homeDoubleKnockSeconds: null,
    awayDoubleKnockSeconds: null,
    nightDoubleKnockSeconds: null,
    modeAwayExtendedSwitchTriggerSeconds: null,
    armingLockSwitch: false,
    armingLockSwitches: false,
    disabledModes: [],
    homeArmSeconds: null,
    awayArmSeconds: null,
    nightArmSeconds: null,
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

function makeMockStateHandler() {
  return {
    updateTargetState: vi.fn(),
    getArmingSeconds: vi.fn().mockReturnValue(0),
  };
}

function makeMockTimers() {
  return {
    setArmTimer: vi.fn(), clearArmTimer: vi.fn(),
    setTriggerTimer: vi.fn(), clearTriggerTimer: vi.fn(), isTriggerRunning: vi.fn().mockReturnValue(false),
    setPauseTimer: vi.fn(), clearPauseTimer: vi.fn(),
    setDoubleKnockTimer: vi.fn(), clearDoubleKnockTimer: vi.fn(),
    setResetTimer: vi.fn(), clearResetTimer: vi.fn(),
    setTrippedInterval: vi.fn(), clearTrippedInterval: vi.fn(),
    setTriggeredInterval: vi.fn(), clearTriggeredInterval: vi.fn(),
    clearAll: vi.fn(),
  } as any;
}

// ── SwitchHandler tests ───────────────────────────────────────────────────────

describe('SwitchHandler.updateModeSwitches', async () => {
  const { SwitchHandler } = await import('../handlers/switch-handler.js');

  it('sets mode OFF switch ON when targetState is OFF', () => {
    const services = makeServices();
    const state = makeState({ targetState: SecurityState.OFF });
    const handler = new SwitchHandler(
      services, state, makeOptions(), {} as any, makeMockLog() as any, makeMockTimers(), makeMockStateHandler() as any,
    );
    const offCharacteristic = services.modeOffSwitchService.getCharacteristic('On' as any)!;

    handler.updateModeSwitches();

    expect(offCharacteristic.value).toBe(true);
  });

  it('sets mode HOME switch ON when targetState is HOME', () => {
    const services = makeServices();
    const state = makeState({ targetState: SecurityState.HOME });
    const handler = new SwitchHandler(
      services, state, makeOptions(), {} as any, makeMockLog() as any, makeMockTimers(), makeMockStateHandler() as any,
    );

    handler.updateModeSwitches();

    expect(services.modeHomeSwitchService.getCharacteristic('On' as any).value).toBe(true);
  });

  it('sets mode AWAY switch ON when targetState is AWAY', () => {
    const services = makeServices();
    const state = makeState({ targetState: SecurityState.AWAY });
    const handler = new SwitchHandler(
      services, state, makeOptions(), {} as any, makeMockLog() as any, makeMockTimers(), makeMockStateHandler() as any,
    );

    handler.updateModeSwitches();

    expect(services.modeAwaySwitchService.getCharacteristic('On' as any).value).toBe(true);
  });

  it('sets mode NIGHT switch ON when targetState is NIGHT', () => {
    const services = makeServices();
    const state = makeState({ targetState: SecurityState.NIGHT });
    const handler = new SwitchHandler(
      services, state, makeOptions(), {} as any, makeMockLog() as any, makeMockTimers(), makeMockStateHandler() as any,
    );

    handler.updateModeSwitches();

    expect(services.modeNightSwitchService.getCharacteristic('On' as any).value).toBe(true);
  });

  it('does not turn on any mode switch when targetState is TRIGGERED', () => {
    const services = makeServices();
    const state = makeState({ targetState: SecurityState.TRIGGERED });
    const handler = new SwitchHandler(
      services, state, makeOptions(), {} as any, makeMockLog() as any, makeMockTimers(), makeMockStateHandler() as any,
    );
    const modeServices = [
      services.modeHomeSwitchService, services.modeAwaySwitchService,
      services.modeNightSwitchService, services.modeOffSwitchService,
      services.modeAwayExtendedSwitchService, services.modePauseSwitchService,
    ];

    handler.updateModeSwitches();

    for (const service of modeServices) {
      expect(service.updateCharacteristic).not.toHaveBeenCalled();
    }
  });

  it('updates characteristic via updateCharacteristic (HomeKit compliant)', () => {
    const services = makeServices();
    const state = makeState({ targetState: SecurityState.OFF });
    const Characteristic = { On: 'On' };
    const handler = new SwitchHandler(
      services, state, makeOptions(), Characteristic as any, makeMockLog() as any, makeMockTimers(), makeMockStateHandler() as any,
    );

    handler.updateModeSwitches();

    expect(services.modeOffSwitchService.updateCharacteristic).toHaveBeenCalledWith('On', true);
  });
});

describe('SwitchHandler.resetModeSwitches', async () => {
  const { SwitchHandler } = await import('../handlers/switch-handler.js');

  it('turns OFF all mode switches that are ON', () => {
    const services = makeServices();
    const state = makeState();
    const handler = new SwitchHandler(
      services, state, makeOptions(), {} as any, makeMockLog() as any, makeMockTimers(), makeMockStateHandler() as any,
    );
    const modeServiceKeys: Array<keyof ServiceRegistry> = [
      'modeHomeSwitchService', 'modeAwaySwitchService', 'modeNightSwitchService',
      'modeOffSwitchService', 'modeAwayExtendedSwitchService', 'modePauseSwitchService',
    ];
    for (const key of modeServiceKeys) {
      (services[key] as any).getCharacteristic('On' as any).value = true;
    }

    handler.resetModeSwitches();

    for (const key of modeServiceKeys) {
      expect((services[key] as any).getCharacteristic('On' as any).value).toBe(false);
    }
  });

  it('does not call updateValue on switches that are already OFF', () => {
    const services = makeServices();
    const state = makeState();
    const handler = new SwitchHandler(
      services, state, makeOptions(), {} as any, makeMockLog() as any, makeMockTimers(), makeMockStateHandler() as any,
    );
    const offCharacteristic = services.modeOffSwitchService.getCharacteristic('On' as any)!;
    offCharacteristic.value = false;

    handler.resetModeSwitches();

    expect(offCharacteristic.updateValue).not.toHaveBeenCalled();
  });
});

describe('SwitchHandler.subscribeToStateEvents', async () => {
  const { SwitchHandler } = await import('../handlers/switch-handler.js');
  const { EventBusService } = await import('../services/event-bus-service.js');
  const { EventType } = await import('../types/event-type.js');

  it('calls updateModeSwitches on UPDATE_MODE_SWITCHES event', () => {
    const bus = new EventBusService();
    const state = makeState({ targetState: SecurityState.HOME });
    const services = makeServices();
    const handler = new SwitchHandler(
      services, state, makeOptions(), {} as any, makeMockLog() as any, makeMockTimers(), makeMockStateHandler() as any,
    );

    handler.subscribeToStateEvents(bus);
    bus.emit(EventType.UPDATE_MODE_SWITCHES, {});

    expect(services.modeHomeSwitchService.getCharacteristic('On' as any).value).toBe(true);
  });

  it('calls resetModeSwitches on RESET_MODE_SWITCHES event', () => {
    const bus = new EventBusService();
    const state = makeState();
    const services = makeServices();
    const handler = new SwitchHandler(
      services, state, makeOptions(), {} as any, makeMockLog() as any, makeMockTimers(), makeMockStateHandler() as any,
    );
    const modeServiceKeys: Array<keyof ServiceRegistry> = [
      'modeHomeSwitchService', 'modeAwaySwitchService', 'modeNightSwitchService',
      'modeOffSwitchService', 'modeAwayExtendedSwitchService', 'modePauseSwitchService',
    ];
    for (const key of modeServiceKeys) {
      (services[key] as any).getCharacteristic('On' as any).value = true;
    }

    handler.subscribeToStateEvents(bus);
    bus.emit(EventType.RESET_MODE_SWITCHES, {});

    for (const key of modeServiceKeys) {
      expect((services[key] as any).getCharacteristic('On' as any).value).toBe(false);
    }
  });
});

// ── Regression: mode switch sync on startup ──────────────────────────────────

describe('SwitchHandler startup sync regression', async () => {
  const { SwitchHandler } = await import('../handlers/switch-handler.js');

  it('sets mode OFF switch ON when state is initialized to OFF (regression test for #889)', () => {
    const services = makeServices();
    const state = makeState({ targetState: SecurityState.OFF });
    const handler = new SwitchHandler(
      services, state, makeOptions(), {} as any, makeMockLog() as any, makeMockTimers(), makeMockStateHandler() as any,
    );

    expect(services.modeOffSwitchService.getCharacteristic('On' as any).value).toBe(false);

    handler.updateModeSwitches();

    expect(services.modeOffSwitchService.getCharacteristic('On' as any).value).toBe(true);
    expect(services.modeHomeSwitchService.getCharacteristic('On' as any).value).toBe(false);
    expect(services.modeAwaySwitchService.getCharacteristic('On' as any).value).toBe(false);
    expect(services.modeNightSwitchService.getCharacteristic('On' as any).value).toBe(false);
  });

  it('sets mode HOME switch ON when state is initialized to HOME', () => {
    const services = makeServices();
    const state = makeState({ targetState: SecurityState.HOME });
    const handler = new SwitchHandler(
      services, state, makeOptions(), {} as any, makeMockLog() as any, makeMockTimers(), makeMockStateHandler() as any,
    );

    handler.updateModeSwitches();

    expect(services.modeHomeSwitchService.getCharacteristic('On' as any).value).toBe(true);
    expect(services.modeOffSwitchService.getCharacteristic('On' as any).value).toBe(false);
  });

  it('sets mode AWAY switch ON when state is initialized to AWAY', () => {
    const services = makeServices();
    const state = makeState({ targetState: SecurityState.AWAY });
    const handler = new SwitchHandler(
      services, state, makeOptions(), {} as any, makeMockLog() as any, makeMockTimers(), makeMockStateHandler() as any,
    );

    handler.updateModeSwitches();

    expect(services.modeAwaySwitchService.getCharacteristic('On' as any).value).toBe(true);
    expect(services.modeOffSwitchService.getCharacteristic('On' as any).value).toBe(false);
  });

  it('sets mode NIGHT switch ON when state is initialized to NIGHT', () => {
    const services = makeServices();
    const state = makeState({ targetState: SecurityState.NIGHT });
    const handler = new SwitchHandler(
      services, state, makeOptions(), {} as any, makeMockLog() as any, makeMockTimers(), makeMockStateHandler() as any,
    );

    handler.updateModeSwitches();

    expect(services.modeNightSwitchService.getCharacteristic('On' as any).value).toBe(true);
    expect(services.modeOffSwitchService.getCharacteristic('On' as any).value).toBe(false);
  });
});
