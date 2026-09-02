import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBusService } from '../services/event-bus-service.js';
import { MatterService } from '../services/matter-service.js';
import type { EventBusService as EventBusType } from '../services/event-bus-service.js';
import { EventType } from '../types/event-type.js';
import { OriginType } from '../types/origin-type.js';
import { SecurityState } from '../types/security-state-type.js';
import type { SystemState } from '../interfaces/system-state-interface.js';
import type { SecuritySystemOptions } from '../interfaces/options-interface.js';
import type { MatterAccessory } from 'homebridge';

// ── Mocks ─────────────────────────────────────────────────────────────────────

class InvalidInState extends Error {}
class ConstraintError extends Error {}
class Failure extends Error {}

function makeMatterMock() {
  return {
    uuid: { generate: vi.fn((seed: string) => `matter-uuid-${seed}`) },
    deviceTypes: {
      OnOffSwitch: { name: 'OnOffSwitch' },
      MotionSensor: { name: 'MotionSensor' },
    },
    clusterNames: { OnOff: 'onOff', OccupancySensing: 'occupancySensing' },
    status: {
      InvalidInState,
      ConstraintError,
      Failure,
      isMatterProtocolError: (error: unknown) =>
        error instanceof InvalidInState || error instanceof ConstraintError || error instanceof Failure,
    },
    registerPlatformAccessories: vi.fn(async (_pluginIdentifier: string, _platformName: string, _accessories: MatterAccessory[]) => undefined),
    unregisterPlatformAccessories: vi.fn(async (_pluginIdentifier: string, _platformName: string, _accessories: MatterAccessory[]) => undefined),
    updateAccessoryState: vi.fn(async (_uuid: string, _cluster: string, _attributes: Record<string, unknown>) => undefined),
    getAccessoryState: vi.fn(async () => undefined),
  };
}

type MatterMock = ReturnType<typeof makeMatterMock>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeLog() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
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
    armingLocks: { global: false, home: false, away: false, night: false },
    modeAwayExtended: false,
    ...overrides,
  };
}

function makeOptions(overrides: Partial<SecuritySystemOptions> = {}): SecuritySystemOptions {
  return {
    serialNumber: 'SEC-1',
    tripSwitchName: 'Trip',
    tripHomeSwitchName: 'Trip Home',
    tripAwaySwitchName: 'Trip Away',
    tripNightSwitchName: 'Trip Night',
    tripOverrideSwitchName: 'Trip Override',
    modeHomeSwitchName: 'Mode Home',
    modeAwaySwitchName: 'Mode Away',
    modeNightSwitchName: 'Mode Night',
    modeOffSwitchName: 'Mode Off',
    modeAwayExtendedSwitchName: 'Mode Away Extended',
    modePauseSwitchName: 'Mode Pause',
    modeSwitches: false,
    modeOffSwitch: false,
    modePauseSwitch: false,
    modeAwayExtendedSwitch: false,
    tripSwitch: false,
    tripOverrideSwitch: false,
    tripModeSwitches: false,
    tripHomeSwitches: [],
    tripAwaySwitches: [],
    tripNightSwitches: [],
    armingLockSwitch: false,
    armingLockSwitches: false,
    armingMotionSensor: false,
    trippedMotionSensor: false,
    resetSensor: false,
    ...overrides,
  } as unknown as SecuritySystemOptions;
}

function makeSwitchHandler() {
  return {
    setModeSwitch: vi.fn((_mode: SecurityState, _value: boolean) => ({ success: true })),
    setModeOffSwitch: vi.fn((_value: boolean) => ({ success: true })),
    setModeAwayExtendedSwitch: vi.fn((_value: boolean) => ({ success: true })),
    setModePauseSwitch: vi.fn((_value: boolean) => ({ success: true })),
    updateArmingLock: vi.fn((_mode: string, _value: boolean) => ({ success: true })),
  };
}

function makeSensorHandler() {
  return {
    getMotionState: vi.fn(() => false),
  };
}

function makeTripHandler() {
  return {
    updateTripSwitch: vi.fn((_value: boolean, _origin: OriginType, _stateChanged: boolean) => ({ success: true })),
    triggerIfModeSet: vi.fn((_mode: SecurityState, _value: boolean) => ({ success: true })),
  };
}

function makeService(options: SecuritySystemOptions, state: SystemState, switchHandler = makeSwitchHandler(), tripHandler = makeTripHandler(), sensorHandler = makeSensorHandler()) {
  const log = makeLog();
  const matter = makeMatterMock();
  const api = { matter, isMatterEnabled: () => true } as never;
  const service = new MatterService(log as never, options, api, state, switchHandler as never, tripHandler as never, sensorHandler as never);
  return { log, matter, service, switchHandler, tripHandler, sensorHandler };
}

function registeredAccessories(matter: MatterMock): MatterAccessory[] {
  return matter.registerPlatformAccessories.mock.calls[0][2] as MatterAccessory[];
}

function accessoryByDisplayName(matter: MatterMock, displayName: string): MatterAccessory {
  const accessory = registeredAccessories(matter).find(a => a.displayName === displayName);
  if (!accessory) {
    throw new Error(`No registered accessory with display name ${displayName}`);
  }
  return accessory;
}

/** Handlers are always present on switches the plugin registers. */
function switchOnHandler(accessory: MatterAccessory): () => void {
  const onOff = accessory.handlers!.onOff!;
  return onOff.on! as () => void;
}

function switchOffHandler(accessory: MatterAccessory): () => void {
  const onOff = accessory.handlers!.onOff!;
  return onOff.off! as () => void;
}

function countSwitchUpdates(matter: MatterMock, uuid: string, value: boolean): number {
  return matter.updateAccessoryState.mock.calls.filter(
    call => call[0] === uuid && (call[2] as { onOff?: boolean }).onOff === value,
  ).length;
}

function makeBus(): EventBusType {
  return new EventBusService();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MatterService', () => {
  let log: ReturnType<typeof makeLog>;

  beforeEach(() => {
    log = makeLog();
    vi.clearAllMocks();
  });

  it('does nothing when Matter is not enabled, even with accessories configured', async () => {
    const state = makeState();
    const options = makeOptions({ tripSwitch: true });
    const service = new MatterService(log as never, options,
      { isMatterEnabled: () => false } as never,
      state, makeSwitchHandler() as never, makeTripHandler() as never, makeSensorHandler() as never);

    await service.registerAccessories(new Map());

    expect(log.info).toHaveBeenCalledWith('Matter is not enabled on this bridge; skipping Matter accessories.');
  });

  it('registers when Matter is enabled on the bridge', async () => {
    const state = makeState();
    const options = makeOptions({ tripSwitch: true });
    const matter = makeMatterMock();
    const service = new MatterService(log as never,
      options, { matter, isMatterEnabled: () => true } as never,
      state, makeSwitchHandler() as never, makeTripHandler() as never, makeSensorHandler() as never);

    await service.registerAccessories(new Map());

    expect(matter.registerPlatformAccessories).toHaveBeenCalledTimes(1);
  });

  it('registers all configured switches and sensors', async () => {
    const state = makeState();
    const options = makeOptions({
      modeSwitches: true,
      modeOffSwitch: true,
      modeAwayExtendedSwitch: true,
      modePauseSwitch: true,
      tripSwitch: true,
      tripOverrideSwitch: true,
      tripModeSwitches: true,
      armingLockSwitch: true,
      armingLockSwitches: true,
      armingMotionSensor: true,
      trippedMotionSensor: true,
      resetSensor: true,
      tripHomeSwitches: [{ label: 'Kitchen' }],
    });
    const { log, matter, service } = makeService(options, state);

    await service.registerAccessories(new Map());

    expect(log.info).toHaveBeenCalledWith(expect.stringContaining('Matter accessories registered'));
    expect(log.info).toHaveBeenCalledWith(expect.stringContaining('Mode Home'));
    expect(matter.registerPlatformAccessories).toHaveBeenCalledTimes(1);
    const accessories = registeredAccessories(matter);
    const names = accessories.map(a => a.displayName);
    expect(names).toContain('Mode Home');
    expect(names).toContain('Mode Away');
    expect(names).toContain('Mode Night');
    expect(names).toContain('Mode Off');
    expect(names).toContain('Mode Away Extended');
    expect(names).toContain('Mode Pause');
    expect(names).toContain('Trip');
    expect(names).toContain('Trip Override');
    expect(names).toContain('Trip Home');
    expect(names).toContain('Trip Away');
    expect(names).toContain('Trip Night');
    expect(names).toContain('Trip Home Kitchen');
    expect(names).toContain('Arming Lock');
    expect(names).toContain('Arming Lock Home');
    expect(names).toContain('Arming');
    expect(names).toContain('Tripped');
    expect(names).toContain('Triggered Reset');

    const modeHome = accessoryByDisplayName(matter, 'Mode Home');
    expect(modeHome.deviceType).toBe(matter.deviceTypes.OnOffSwitch);
    expect(modeHome.clusters).toEqual({ onOff: { onOff: false } });
    expect(modeHome.handlers?.onOff?.on).toBeDefined();

    const armingSensor = accessoryByDisplayName(matter, 'Arming');
    expect(armingSensor.deviceType).toBe(matter.deviceTypes.MotionSensor);
    expect(armingSensor.clusters).toEqual({
      occupancySensing: { occupancy: { occupied: false }, occupancySensorTypeBitmap: { pir: true } },
    });
    expect(armingSensor.UUID).toMatch(/^matter-uuid-motion-sensor-1$/);
  });

  it('skips accessories disabled in options and disabled modes', async () => {
    const state = makeState({ availableTargetStates: [SecurityState.AWAY, SecurityState.OFF] });
    const options = makeOptions({ tripSwitch: true, tripHomeSwitches: [{ label: 'Kitchen' }] });
    const { matter, service } = makeService(options, state);

    await service.registerAccessories(new Map());

    const names = registeredAccessories(matter).map(a => a.displayName);
    expect(names).toEqual(['Trip']);
  });

  it('does not re-register cached accessories and removes stale ones', async () => {
    const state = makeState();
    const options = makeOptions({ tripSwitch: true });
    const { matter, service } = makeService(options, state);

    const cached = new Map<string, MatterAccessory>([
      ['matter-uuid-switch-1', { UUID: 'matter-uuid-switch-1' } as unknown as MatterAccessory],
      ['stale-uuid', { UUID: 'stale-uuid' } as unknown as MatterAccessory],
    ]);

    await service.registerAccessories(cached);

    expect(matter.registerPlatformAccessories).not.toHaveBeenCalled();
    expect(matter.unregisterPlatformAccessories).toHaveBeenCalledWith(
      'homebridge-securitysystem',
      'security-system',
      [cached.get('stale-uuid')],
    );
  });

  it('uses device-type-indexed identities for the uuid and serial number', async () => {
    const state = makeState();
    const options = makeOptions({ modeSwitches: true, trippedMotionSensor: true });
    const { matter, service } = makeService(options, state);

    await service.registerAccessories(new Map());

    const modeHome = accessoryByDisplayName(matter, 'Mode Home');
    expect(modeHome.UUID).toBe('matter-uuid-switch-6');
    expect(modeHome.serialNumber).toBe('switch-6');
    expect(modeHome.context).toEqual({ key: 'mode-home', identity: 'switch-6' });

    const trippedSensor = accessoryByDisplayName(matter, 'Tripped');
    expect(trippedSensor.UUID).toBe('matter-uuid-motion-sensor-2');
    expect(trippedSensor.serialNumber).toBe('motion-sensor-2');
  });

  it('routes mode switch commands to SwitchHandler and blocks with InvalidInState', async () => {
    const state = makeState();
    const options = makeOptions({ modeSwitches: true });
    const switchHandler = makeSwitchHandler();
    switchHandler.setModeSwitch = vi.fn((mode: SecurityState, value: boolean) =>
      mode === SecurityState.HOME && value ? { success: true } : { success: false, reason: 'a mode switch can only be turned on' });

    const { log, matter, service } = makeService(options, state, switchHandler, makeTripHandler());

    await service.registerAccessories(new Map());

    const modeHome = accessoryByDisplayName(matter, 'Mode Home');
    const onHandler = switchOnHandler(modeHome);
    const offHandler = switchOffHandler(modeHome);

    expect(() => onHandler()).not.toThrow();
    expect(switchHandler.setModeSwitch).toHaveBeenCalledWith(SecurityState.HOME, true);

    expect(() => offHandler()).toThrow();
    expect(switchHandler.setModeSwitch).toHaveBeenCalledWith(SecurityState.HOME, false);
    expect(log.debug).toHaveBeenCalledWith(expect.stringContaining('Matter command failed (mode-home)'));
  });

  it('routes trip switch commands to TripHandler with the right origin', async () => {
    const state = makeState();
    const options = makeOptions({ tripSwitch: true, tripOverrideSwitch: true, tripModeSwitches: true });
    const tripHandler = makeTripHandler();
    const { matter, service } = makeService(options, state, makeSwitchHandler(), tripHandler);

    await service.registerAccessories(new Map());

    const trip = accessoryByDisplayName(matter, 'Trip');
    switchOnHandler(trip)();
    expect(tripHandler.updateTripSwitch).toHaveBeenCalledWith(true, OriginType.REGULAR_SWITCH, false);

    const tripHome = accessoryByDisplayName(matter, 'Trip Home');
    switchOnHandler(tripHome)();
    expect(tripHandler.triggerIfModeSet).toHaveBeenCalledWith(SecurityState.HOME, true);

    const tripOverride = accessoryByDisplayName(matter, 'Trip Override');
    switchOnHandler(tripOverride)();
    expect(tripHandler.updateTripSwitch).toHaveBeenCalledWith(true, OriginType.OVERRIDE_SWITCH, false);
  });

  it('throws InvalidInState when a trip is blocked by a condition', async () => {
    const state = makeState();
    const options = makeOptions({ tripSwitch: true });
    const tripHandler = makeTripHandler();
    tripHandler.updateTripSwitch = vi.fn(() => ({ success: false, reason: 'system is not armed' }));

    const { matter, service } = makeService(options, state, makeSwitchHandler(), tripHandler);

    await service.registerAccessories(new Map());

    const trip = accessoryByDisplayName(matter, 'Trip');
    expect(() => switchOnHandler(trip)()).toThrowError('system is not armed');
  });

  it('routes arming lock commands to SwitchHandler', async () => {
    const state = makeState();
    const options = makeOptions({ armingLockSwitch: true, armingLockSwitches: true });
    const switchHandler = makeSwitchHandler();
    const { matter, service } = makeService(options, state, switchHandler, makeTripHandler());

    await service.registerAccessories(new Map());

    const globalLock = accessoryByDisplayName(matter, 'Arming Lock');
    switchOnHandler(globalLock)();
    expect(switchHandler.updateArmingLock).toHaveBeenCalledWith('global', true);

    const homeLock = accessoryByDisplayName(matter, 'Arming Lock Home');
    switchOffHandler(homeLock)();
    expect(switchHandler.updateArmingLock).toHaveBeenCalledWith('home', false);
  });

  it('pushes mode switch state on bus events, only when the value changed', async () => {
    const state = makeState({ targetState: SecurityState.HOME });
    const options = makeOptions({ modeSwitches: true, modeOffSwitch: true });
    const { matter, service } = makeService(options, state);

    const bus = makeBus();
    service.attachToBus(bus);
    await service.registerAccessories(new Map());

    // Startup sync: mode-home on, every other mode switch off.
    expect(countSwitchUpdates(matter, 'matter-uuid-switch-6', true)).toBe(1);
    expect(countSwitchUpdates(matter, 'matter-uuid-switch-6', false)).toBe(0);
    expect(countSwitchUpdates(matter, 'matter-uuid-switch-7', false)).toBe(1);
    expect(countSwitchUpdates(matter, 'matter-uuid-switch-9', false)).toBe(1);

    bus.emit(EventType.RESET_MODE_SWITCHES, {});

    // Only mode-home changed (on -> off); the others stay untouched.
    expect(countSwitchUpdates(matter, 'matter-uuid-switch-6', true)).toBe(1);
    expect(countSwitchUpdates(matter, 'matter-uuid-switch-6', false)).toBe(1);
    expect(countSwitchUpdates(matter, 'matter-uuid-switch-7', false)).toBe(1);
    expect(countSwitchUpdates(matter, 'matter-uuid-switch-9', false)).toBe(1);

    bus.emit(EventType.UPDATE_MODE_SWITCHES, {});
    expect(countSwitchUpdates(matter, 'matter-uuid-switch-6', true)).toBe(2);

    // Redundant re-emission pushes nothing new.
    bus.emit(EventType.UPDATE_MODE_SWITCHES, {});
    expect(countSwitchUpdates(matter, 'matter-uuid-switch-6', true)).toBe(2);
  });

  it('resets trip switches to off at startup and after a controller trip', async () => {
    const state = makeState();
    const options = makeOptions({ tripSwitch: true, tripModeSwitches: true, tripHomeSwitches: [{ label: 'Kitchen' }] });
    const { matter, service } = makeService(options, state);

    const bus = makeBus();
    service.attachToBus(bus);
    await service.registerAccessories(new Map());

    // Startup sync pushes every trip switch off (Homebridge would auto-update
    // onOff after a trip, so the reset must be able to push it back).
    expect(countSwitchUpdates(matter, 'matter-uuid-switch-1', false)).toBe(1);
    expect(countSwitchUpdates(matter, 'matter-uuid-switch-16', false)).toBe(1);

    // A controller trip turns the switch on (auto-updated by Homebridge and
    // recorded by the service as if it had happened).
    const trip = accessoryByDisplayName(matter, 'Trip');
    switchOnHandler(trip)();

    // The reset now sees a change and pushes the switch back off.
    bus.emit(EventType.RESET_TRIP_SWITCHES, {});
    expect(countSwitchUpdates(matter, 'matter-uuid-switch-1', false)).toBe(2);

    // An unchanged trip switch is not pushed again.
    bus.emit(EventType.RESET_TRIP_SWITCHES, {});
    expect(countSwitchUpdates(matter, 'matter-uuid-switch-1', false)).toBe(2);
  });

  it('pushes sensor occupancy state on SENSOR_STATE_CHANGED', async () => {
    const state = makeState();
    const options = makeOptions({ trippedMotionSensor: true, resetSensor: true });
    const { matter, service } = makeService(options, state);

    const bus = makeBus();
    service.attachToBus(bus);
    await service.registerAccessories(new Map());

    bus.emit(EventType.SENSOR_STATE_CHANGED, { sensor: 'tripped', value: true });
    bus.emit(EventType.SENSOR_STATE_CHANGED, { sensor: 'tripped', value: true });
    bus.emit(EventType.SENSOR_STATE_CHANGED, { sensor: 'reset', value: false });

    expect(matter.updateAccessoryState).toHaveBeenCalledWith(
      'matter-uuid-motion-sensor-2',
      'occupancySensing',
      { occupancy: { occupied: true } },
    );
    expect(matter.updateAccessoryState).toHaveBeenCalledWith(
      'matter-uuid-motion-sensor-3',
      'occupancySensing',
      { occupancy: { occupied: false } },
    );

    // A repeated reading of the same value is not pushed again. The startup sync
    // pushed an occupied:false once, so only the single occupied:true push counts.
    const occupiedPushes = matter.updateAccessoryState.mock.calls.filter(
      call => call[0] === 'matter-uuid-motion-sensor-2'
        && (call[2] as { occupancy?: { occupied?: boolean } }).occupancy?.occupied === true,
    );
    expect(occupiedPushes).toHaveLength(1);
  });

  it('syncs every registered mode switch to the current target state after registration', async () => {
    const state = makeState({ targetState: SecurityState.AWAY });
    const options = makeOptions({ modeSwitches: true });
    const { matter, service } = makeService(options, state);

    await service.registerAccessories(new Map());

    // mode-away (switch-7) on, mode-home (switch-6) off.
    expect(countSwitchUpdates(matter, 'matter-uuid-switch-7', true)).toBe(1);
    expect(countSwitchUpdates(matter, 'matter-uuid-switch-6', false)).toBe(1);
  });

  it('translates unexpected handler errors into a Matter Failure', async () => {
    const state = makeState();
    const options = makeOptions({ modeSwitches: true });
    const switchHandler = makeSwitchHandler();
    switchHandler.setModeSwitch = vi.fn(() => {
      throw new Error('device exploded');
    });

    const { matter, service } = makeService(options, state, switchHandler, makeTripHandler());

    await service.registerAccessories(new Map());

    const modeHome = accessoryByDisplayName(matter, 'Mode Home');
    let caught: unknown;
    try {
      switchOnHandler(modeHome)();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Failure);
    expect((caught as Error).message).toBe('device exploded');
  });

  it('keeps already-mapped Matter protocol errors intact', async () => {
    const state = makeState();
    const options = makeOptions({ modeSwitches: true });
    const switchHandler = makeSwitchHandler();
    const blocked = new InvalidInState('still arming');
    switchHandler.setModeSwitch = vi.fn(() => {
      throw blocked;
    });

    const { matter, service } = makeService(options, state, switchHandler, makeTripHandler());

    await service.registerAccessories(new Map());

    const modeHome = accessoryByDisplayName(matter, 'Mode Home');
    let caught: unknown;
    try {
      switchOnHandler(modeHome)();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBe(blocked);
  });

  it('keeps the controller state honest when a command is refused', async () => {
    const state = makeState();
    const options = makeOptions({ modeSwitches: true });
    const switchHandler = makeSwitchHandler();
    switchHandler.setModeSwitch = vi.fn(() => ({ success: false, reason: 'arming is blocked by an arming lock switch' }));
    const { matter, service } = makeService(options, state, switchHandler, makeTripHandler());

    await service.registerAccessories(new Map());

    const modeHome = accessoryByDisplayName(matter, 'Mode Home');
    expect(() => switchOnHandler(modeHome)()).toThrow();

    // The startup sync pushed the switch off; the refused command must not
    // record it as on, otherwise the switch would appear stuck on.
    expect(countSwitchUpdates(matter, 'matter-uuid-switch-6', true)).toBe(0);
  });

  it('syncs arming-lock switches from state at registration', async () => {
    const state = makeState({ armingLocks: { global: true, home: false, away: false, night: false } });
    const options = makeOptions({ armingLockSwitch: true, armingLockSwitches: true });
    const { matter, service } = makeService(options, state);

    await service.registerAccessories(new Map());

    // global lock (switch-12) on, mode locks (switch-13..15) off.
    expect(countSwitchUpdates(matter, 'matter-uuid-switch-12', true)).toBe(1);
    expect(countSwitchUpdates(matter, 'matter-uuid-switch-12', false)).toBe(0);
    expect(countSwitchUpdates(matter, 'matter-uuid-switch-13', false)).toBe(1);
    expect(countSwitchUpdates(matter, 'matter-uuid-switch-14', false)).toBe(1);
    expect(countSwitchUpdates(matter, 'matter-uuid-switch-15', false)).toBe(1);
  });

  it('pushes the current sensor reading at registration', async () => {
    const state = makeState();
    const options = makeOptions({ trippedMotionSensor: true, resetSensor: true });
    const sensorHandler = makeSensorHandler();
    // Sync loop only asks for configured sensors: tripped first, then reset.
    sensorHandler.getMotionState.mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    const { matter, service } = makeService(options, state, makeSwitchHandler(), makeTripHandler(), sensorHandler);

    await service.registerAccessories(new Map());

    expect(matter.updateAccessoryState).toHaveBeenCalledWith(
      'matter-uuid-motion-sensor-2', 'occupancySensing', { occupancy: { occupied: true } },
    );
    expect(matter.updateAccessoryState).toHaveBeenCalledWith(
      'matter-uuid-motion-sensor-3', 'occupancySensing', { occupancy: { occupied: false } },
    );
  });

  it('pushes the trip switch on when a trip fires from the server or webhooks', async () => {
    const state = makeState();
    const options = makeOptions({ tripSwitch: true });
    const { matter, service } = makeService(options, state);

    const bus = makeBus();
    service.attachToBus(bus);
    await service.registerAccessories(new Map());

    bus.emit(EventType.TRIGGER_FIRED, { origin: OriginType.EXTERNAL });
    expect(countSwitchUpdates(matter, 'matter-uuid-switch-1', true)).toBe(1);

    // Controller-initiated trips are auto-updated by Homebridge; nothing to push.
    bus.emit(EventType.TRIGGER_FIRED, { origin: OriginType.REGULAR_SWITCH });
    expect(countSwitchUpdates(matter, 'matter-uuid-switch-1', true)).toBe(1);
  });

  it('exposes pause and away-extended switches even when modeSwitches is off', async () => {
    const state = makeState();
    const options = makeOptions({ modeSwitches: false, modePauseSwitch: true, modeAwayExtendedSwitch: true });
    const { matter, service } = makeService(options, state);

    await service.registerAccessories(new Map());

    const names = registeredAccessories(matter).map(a => a.displayName);
    expect(names).toContain('Mode Pause');
    expect(names).toContain('Mode Away Extended');
    expect(names).not.toContain('Mode Home');
    expect(names).not.toContain('Mode Off');
  });
});
