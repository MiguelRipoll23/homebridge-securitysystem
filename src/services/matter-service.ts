import type { API, Logging, MatterAccessory } from 'homebridge';
import {
  MATTER_ARMING_LOCK_SWITCH_KEYS,
  MATTER_CUSTOM_TRIP_START_INDEX,
  MATTER_MANUFACTURER,
  MATTER_MODEL,
  MATTER_MODE_SWITCH_KEYS,
  MATTER_SENSOR_IDENTITIES,
  MATTER_SWITCH_IDENTITIES,
  MATTER_TRIP_SWITCH_KEYS,
} from '../constants/matter-constant.js';
import type { SensorHandler } from '../handlers/sensor-handler.js';
import type { SwitchHandler } from '../handlers/switch-handler.js';
import type { TripHandler } from '../handlers/trip-handler.js';
import type { SecuritySystemOptions } from '../interfaces/options-interface.js';
import type { SystemState } from '../interfaces/system-state-interface.js';
import type { ServiceResult } from '../types/service-result-type.js';
import type { EventBusService } from './event-bus-service.js';
import { EventType } from '../types/event-type.js';
import type { FixedMatterSwitchKey, MatterAccessoryKey } from '../types/matter-accessory-key-type.js';
import { OriginType } from '../types/origin-type.js';
import { SecurityState } from '../types/security-state-type.js';
import type { SensorKind } from '../types/sensor-kind-type.js';
import { capitalise, modeToState } from '../utils/state-util.js';

const PLUGIN_NAME = 'homebridge-securitysystem';
const PLATFORM_NAME = 'security-system';

/** Maps each Matter arming-lock switch key to its SystemState lock field. */
const LOCK_FIELD_BY_SWITCH_KEY: Record<(typeof MATTER_ARMING_LOCK_SWITCH_KEYS)[number], keyof SystemState['armingLocks']> = {
  'arming-lock': 'global',
  'arming-lock-home': 'home',
  'arming-lock-away': 'away',
  'arming-lock-night': 'night',
};

type MatterApi = NonNullable<API['matter']>;
type CommandResult = ServiceResult | null;

/**
 * Publishes the optional switch and sensor accessories over Matter (HAP keeps
 * the main SecuritySystem service and the motion sensors). Switches are
 * Matter-only. The security system has no Matter device type, so every control
 * is exposed as an OnOffSwitch and every sensor as a MotionSensor.
 *
 * Identities follow the `<device-type>-<index>` convention (`switch-1`,
 * `motion-sensor-2`, …) and are fed through `api.matter.uuid.generate()` to
 * produce stable UUIDs. Commands from the Matter controller call straight into
 * the existing handlers; state changes reach it through bus events and
 * `updateAccessoryState()`, mirroring the HAP characteristic updates.
 */
export class MatterService {
  private readonly accessoryUuidByKey = new Map<MatterAccessoryKey, string>();
  private readonly sensorUuidByKind = new Map<SensorKind, string>();

  // Last value pushed per accessory, so redundant updates are skipped
  // (best practice: compare before updating).
  private readonly pushedSwitchStateByKey = new Map<MatterAccessoryKey, boolean>();
  private readonly pushedSensorStateByKind = new Map<SensorKind, boolean>();

  private matter: MatterApi | undefined;

  constructor(
    private readonly log: Logging,
    private readonly options: SecuritySystemOptions,
    private readonly api: API,
    private readonly state: SystemState,
    private readonly switchHandler: SwitchHandler,
    private readonly tripHandler: TripHandler,
    private readonly sensorHandler: SensorHandler,
  ) {}

  attachToBus(bus: EventBusService): void {
    bus.on(EventType.RESET_MODE_SWITCHES, () => this.pushModeSwitchesOff());
    bus.on(EventType.UPDATE_MODE_SWITCHES, () => this.pushModeSwitchForTargetState());
    bus.on(EventType.RESET_TRIP_SWITCHES, () => this.pushTripSwitchesOff());
    bus.on(EventType.SENSOR_STATE_CHANGED, ({ sensor, value }) => this.pushSensorState(sensor, value));
    // Trips started by the server/webhooks used to light the HAP trip switch;
    // mirror that to the Matter trip switch so the cause stays visible.
    bus.on(EventType.TRIGGER_FIRED, ({ origin }) => {
      if (origin === OriginType.INTERNAL || origin === OriginType.EXTERNAL) {
        this.pushSwitch('trip', true);
      }
    });
  }

  /**
   * Registers every configured Matter accessory and removes cached ones that are
   * no longer configured. Accessories restored from Homebridge's cache are
   * matched by UUID and adopted by the Matter server, so they are not
   * re-registered. No-op when Matter is disabled on the bridge.
   */
  async registerAccessories(cachedAccessories: Map<string, MatterAccessory>): Promise<void> {
    // The documented guard: past this point api.matter is guaranteed to be
    // present (see "Checking Matter is available" in the plugin docs).
    if (!this.api.isMatterEnabled()) {
      this.log.info('Matter is not enabled on this bridge; skipping Matter accessories.');
      return;
    }
    const matter = this.api.matter!;
    this.matter = matter;

    const desired = new Map<string, MatterAccessory>();
    this.addModeSwitches(desired, matter);
    this.addTripSwitches(desired, matter);
    this.addArmingLockSwitches(desired, matter);
    this.addMotionSensors(desired, matter);

    const accessoriesToRegister = Array.from(desired.values())
      .filter(accessory => !cachedAccessories.has(accessory.UUID));
    if (accessoriesToRegister.length > 0) {
      await matter.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, accessoriesToRegister);
      this.log.info(`Matter accessories registered: ${accessoriesToRegister.map(a => a.displayName).join(', ')}`);
    }

    const staleAccessories = Array.from(cachedAccessories.values())
      .filter(accessory => !desired.has(accessory.UUID));
    if (staleAccessories.length > 0) {
      await matter.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, staleAccessories);
      this.log.info(`Matter accessories removed: ${staleAccessories.map(a => a.displayName).join(', ')}`);
    }

    // Declared cluster values are only first-run defaults. Force the controller's
    // view to match the real system state: mode switches follow the target state,
    // trip switches come up off.
    this.syncInitialState();
  }

  // ── Accessory building ─────────────────────────────────────────────────────

  private addModeSwitches(desired: Map<string, MatterAccessory>, matter: MatterApi): void {
    const available = this.state.availableTargetStates;
    if (this.options.modeSwitches) {
      if (available.includes(SecurityState.HOME)) {
        this.addOnOffSwitch(desired, matter, 'mode-home', this.options.modeHomeSwitchName,
          value => this.switchHandler.setModeSwitch(SecurityState.HOME, value));
      }
      if (available.includes(SecurityState.AWAY)) {
        this.addOnOffSwitch(desired, matter, 'mode-away', this.options.modeAwaySwitchName,
          value => this.switchHandler.setModeSwitch(SecurityState.AWAY, value));
      }
      if (available.includes(SecurityState.NIGHT)) {
        this.addOnOffSwitch(desired, matter, 'mode-night', this.options.modeNightSwitchName,
          value => this.switchHandler.setModeSwitch(SecurityState.NIGHT, value));
      }
      if (this.options.modeOffSwitch) {
        this.addOnOffSwitch(desired, matter, 'mode-off', this.options.modeOffSwitchName,
          value => this.switchHandler.setModeOffSwitch(value));
      }
    }
    if (this.options.modeAwayExtendedSwitch) {
      this.addOnOffSwitch(desired, matter, 'mode-away-extended', this.options.modeAwayExtendedSwitchName,
        value => this.switchHandler.setModeAwayExtendedSwitch(value));
    }
    if (this.options.modePauseSwitch) {
      this.addOnOffSwitch(desired, matter, 'mode-pause', this.options.modePauseSwitchName,
        value => this.switchHandler.setModePauseSwitch(value));
    }
  }

  private addTripSwitches(desired: Map<string, MatterAccessory>, matter: MatterApi): void {
    if (this.options.tripSwitch) {
      this.addOnOffSwitch(desired, matter, 'trip', this.options.tripSwitchName,
        value => this.tripHandler.updateTripSwitch(value, OriginType.REGULAR_SWITCH, false));
    }
    if (this.options.tripOverrideSwitch) {
      this.addOnOffSwitch(desired, matter, 'trip-override', this.options.tripOverrideSwitchName,
        value => this.tripHandler.updateTripSwitch(value, OriginType.OVERRIDE_SWITCH, false));
    }
    if (this.options.tripModeSwitches) {
      const modeTrips: Array<[MatterAccessoryKey, SecurityState, string]> = [
        ['trip-home', SecurityState.HOME, this.options.tripHomeSwitchName],
        ['trip-away', SecurityState.AWAY, this.options.tripAwaySwitchName],
        ['trip-night', SecurityState.NIGHT, this.options.tripNightSwitchName],
      ];
      for (const [key, mode, displayName] of modeTrips) {
        if (this.state.availableTargetStates.includes(mode)) {
          this.addOnOffSwitch(desired, matter, key, displayName,
            value => this.tripHandler.triggerIfModeSet(mode, value));
        }
      }
    }

    const customGroups: Array<['home' | 'away' | 'night', { label: string }[]]> = [
      ['home', this.options.tripHomeSwitches],
      ['away', this.options.tripAwaySwitches],
      ['night', this.options.tripNightSwitches],
    ];
    let customSwitchIndex = MATTER_CUSTOM_TRIP_START_INDEX;
    for (const [modeLabel, tripSwitches] of customGroups) {
      const mode = modeToState(modeLabel);
      if (!this.state.availableTargetStates.includes(mode)) {
        continue;
      }
      tripSwitches.forEach((tripSwitch, index) => {
        const key = `trip-custom-${modeLabel}-${index}` as MatterAccessoryKey;
        this.addOnOffSwitch(desired, matter, key,
          `Trip ${capitalise(modeLabel)} ${tripSwitch.label}`,
          value => this.tripHandler.triggerIfModeSet(mode, value),
          `switch-${customSwitchIndex++}`);
      });
    }
  }

  private addArmingLockSwitches(desired: Map<string, MatterAccessory>, matter: MatterApi): void {
    if (this.options.armingLockSwitch) {
      this.addOnOffSwitch(desired, matter, 'arming-lock', 'Arming Lock',
        value => this.switchHandler.updateArmingLock('global', value));
    }
    if (this.options.armingLockSwitches) {
      const modeLocks: Array<[MatterAccessoryKey, string, string]> = [
        ['arming-lock-home', 'home', 'Arming Lock Home'],
        ['arming-lock-away', 'away', 'Arming Lock Away'],
        ['arming-lock-night', 'night', 'Arming Lock Night'],
      ];
      for (const [key, mode, displayName] of modeLocks) {
        this.addOnOffSwitch(desired, matter, key, displayName,
          value => this.switchHandler.updateArmingLock(mode, value));
      }
    }
  }

  private addMotionSensors(desired: Map<string, MatterAccessory>, matter: MatterApi): void {
    if (this.options.armingMotionSensor) {
      this.addMotionSensor(desired, matter, 'arming', 'Arming');
    }
    if (this.options.trippedMotionSensor) {
      this.addMotionSensor(desired, matter, 'tripped', 'Tripped');
    }
    if (this.options.resetSensor) {
      this.addMotionSensor(desired, matter, 'reset', 'Triggered Reset');
    }
  }

  private addOnOffSwitch(
    desired: Map<string, MatterAccessory>,
    matter: MatterApi,
    key: MatterAccessoryKey,
    displayName: string,
    command: (value: boolean) => CommandResult,
    identity: string = MATTER_SWITCH_IDENTITIES[key as FixedMatterSwitchKey],
  ): void {
    const uuid = this.uuidFor(matter, identity);
    this.accessoryUuidByKey.set(key, uuid);

    desired.set(uuid, {
      UUID: uuid,
      displayName,
      deviceType: matter.deviceTypes.OnOffSwitch,
      serialNumber: identity,
      manufacturer: MATTER_MANUFACTURER,
      model: MATTER_MODEL,
      context: { key, identity },
      clusters: { onOff: { onOff: false } },
      handlers: {
        onOff: {
          on: () => this.runCommand(matter, key, command, true),
          off: () => this.runCommand(matter, key, command, false),
        },
      },
    });
  }

  /** Sensors declare no handlers — they only push readings with updateAccessoryState. */
  private addMotionSensor(
    desired: Map<string, MatterAccessory>,
    matter: MatterApi,
    kind: SensorKind,
    displayName: string,
  ): void {
    const identity = MATTER_SENSOR_IDENTITIES[kind];
    const uuid = this.uuidFor(matter, identity);
    this.sensorUuidByKind.set(kind, uuid);

    desired.set(uuid, {
      UUID: uuid,
      displayName,
      deviceType: matter.deviceTypes.MotionSensor,
      serialNumber: identity,
      manufacturer: MATTER_MANUFACTURER,
      model: MATTER_MODEL,
      context: { key: `sensor-${kind}` as MatterAccessoryKey, identity },
      clusters: {
        occupancySensing: {
          occupancy: { occupied: false },
          occupancySensorTypeBitmap: { pir: true },
        },
      },
    });
  }

  // ── Command handling ───────────────────────────────────────────────────────

  /**
   * Runs a controller command, translating failures into Matter status errors:
   * a blocked action throws a specific status class, and any unexpected error
   * from the underlying handler becomes a generic Failure instead of escaping
   * as an untyped error (matter-errors best practice).
   */
  private runCommand(
    matter: MatterApi,
    key: MatterAccessoryKey,
    command: (value: boolean) => CommandResult,
    value: boolean,
  ): void {
    try {
      this.throwIfBlocked(matter, command(value));
      // Homebridge auto-updates the onOff attribute after a successful command.
      // Record that so a later reset event sees the change and pushes it back.
      this.pushedSwitchStateByKey.set(key, value);
    } catch (error) {
      this.log.debug(`Matter command failed (${key}): ${String(error)}`);
      this.rethrowAsMatterError(matter, error);
    }
  }

  private throwIfBlocked(matter: MatterApi, result: CommandResult): void {
    if (result === null) {
      return;
    }
    if (!result.success) {
      const reason = result.reason ?? 'Action not allowed in the current state';
      if (reason === 'target mode is disabled') {
        throw new matter.status.ConstraintError(reason);
      }
      throw new matter.status.InvalidInState(reason);
    }
  }

  private rethrowAsMatterError(matter: MatterApi, error: unknown): never {
    if (matter.status.isMatterProtocolError(error)) {
      throw error;
    }
    throw new matter.status.Failure(error instanceof Error ? error.message : String(error));
  }

  // ── State pushing ──────────────────────────────────────────────────────────

  private pushModeSwitchesOff(): void {
    for (const key of MATTER_MODE_SWITCH_KEYS) {
      this.pushSwitch(key, false);
    }
  }

  private pushModeSwitchForTargetState(): void {
    const key = this.modeSwitchKeyForTarget();
    if (key) {
      this.pushSwitch(key, true);
    }
  }

  private modeSwitchKeyForTarget(): MatterAccessoryKey | null {
    const modeMap: Partial<Record<SecurityState, MatterAccessoryKey>> = {
      [SecurityState.HOME]: 'mode-home',
      [SecurityState.AWAY]: 'mode-away',
      [SecurityState.NIGHT]: 'mode-night',
      [SecurityState.OFF]: 'mode-off',
    };
    return modeMap[this.state.targetState] ?? null;
  }

  private pushTripSwitchesOff(): void {
    for (const key of MATTER_TRIP_SWITCH_KEYS) {
      this.pushSwitch(key, false);
    }
    for (const key of this.accessoryUuidByKey.keys()) {
      if (key.startsWith('trip-custom-')) {
        this.pushSwitch(key, false);
      }
    }
  }

  private pushLockSwitches(): void {
    for (const key of MATTER_ARMING_LOCK_SWITCH_KEYS) {
      this.pushSwitch(key, this.state.armingLocks[LOCK_FIELD_BY_SWITCH_KEY[key]]);
    }
  }

  private pushSwitch(key: MatterAccessoryKey, value: boolean): void {
    const uuid = this.accessoryUuidByKey.get(key);
    if (!uuid || !this.matter) {
      return;
    }
    if (this.pushedSwitchStateByKey.get(key) === value) {
      return;
    }
    this.pushedSwitchStateByKey.set(key, value);
    this.pushAccessoryState(uuid, this.matter.clusterNames.OnOff, { onOff: value });
  }

  private pushSensorState(sensor: SensorKind, value: boolean): void {
    const uuid = this.sensorUuidByKind.get(sensor);
    if (!uuid || !this.matter) {
      return;
    }
    if (this.pushedSensorStateByKind.get(sensor) === value) {
      return;
    }
    this.pushedSensorStateByKind.set(sensor, value);
    this.pushAccessoryState(uuid, this.matter.clusterNames.OccupancySensing, { occupancy: { occupied: value } });
  }

  /** Syncs every registered switch/sensor to its real state after registration. */
  private syncInitialState(): void {
    if (!this.matter) {
      return;
    }
    const targetKey = this.modeSwitchKeyForTarget();
    for (const key of MATTER_MODE_SWITCH_KEYS) {
      if (this.accessoryUuidByKey.has(key)) {
        this.pushSwitch(key, key === targetKey);
      }
    }
    for (const key of MATTER_TRIP_SWITCH_KEYS) {
      if (this.accessoryUuidByKey.has(key)) {
        this.pushSwitch(key, false);
      }
    }
    for (const key of this.accessoryUuidByKey.keys()) {
      if (key.startsWith('trip-custom-')) {
        this.pushSwitch(key, false);
      }
    }
    this.pushLockSwitches();

    // Sensors: push their current reading so a mid-pulse state at startup is
    // not lost (declared cluster values are only first-run defaults).
    for (const kind of ['arming', 'tripped', 'reset'] as const) {
      if (this.sensorUuidByKind.has(kind)) {
        this.pushSensorState(kind, this.sensorHandler.getMotionState(kind));
      }
    }
  }

  private pushAccessoryState(uuid: string, clusterName: string, attributes: Record<string, unknown>): void {
    this.matter?.updateAccessoryState(uuid, clusterName, attributes).catch((error: unknown) => {
      this.log.debug(`Matter state update failed (${uuid}): ${String(error)}`);
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private uuidFor(matter: MatterApi, identity: string): string {
    return matter.uuid.generate(identity);
  }
}
