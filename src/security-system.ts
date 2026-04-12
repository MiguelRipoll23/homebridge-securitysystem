import type { API, AccessoryPlugin, Logging, Service, CharacteristicValue } from 'homebridge';
import { HAPStatus } from 'homebridge';
import type { CharacteristicConstructor } from './interfaces/hap-types-interface.js';
import { SecurityState } from './types/security-state-type.js';
import { OriginType } from './types/origin-type.js';
import { HK_NOT_ALLOWED_IN_CURRENT_STATE } from './constants/homekit-constant.js';
import { SWITCH_UUIDS } from './constants/switch-uuid-constant.js';
import { ConfigurationService } from './services/configuration-service.js';
import { attachFileLogger } from './utils/log-util.js';
import { stateToMode } from './utils/state-util.js';
import type { SecuritySystemOptions } from './interfaces/options-interface.js';
import type { SystemState } from './interfaces/system-state-interface.js';
import type { ServiceRegistry } from './interfaces/service-registry-interface.js';
import { EventBusService } from './services/event-bus-service.js';
import { StorageService } from './services/storage-service.js';
import { AudioService } from './services/audio-service.js';
import { WebhookService } from './services/webhook-service.js';
import { CommandService } from './services/command-service.js';
import { ServerService } from './services/server-service.js';
import { StateHandler } from './handlers/state-handler.js';
import { TripHandler } from './handlers/trip-handler.js';
import { SwitchHandler } from './handlers/switch-handler.js';
import { SensorHandler } from './handlers/sensor-handler.js';

export class SecuritySystem implements AccessoryPlugin {
  private readonly options: SecuritySystemOptions;
  private readonly state: SystemState;
  private readonly svcs: ServiceRegistry;
  private readonly serviceList: Service[];

  private readonly bus: EventBusService;
  private readonly stateHandler: StateHandler;
  private readonly tripHandler: TripHandler;
  private readonly switchHandler: SwitchHandler;
  private readonly sensorHandler: SensorHandler;
  private readonly storageService: StorageService;
  private readonly audioService: AudioService;

  constructor(
    private readonly log: Logging,
    config: Record<string, unknown>,
    private readonly api: API,
  ) {
    const Char = api.hap.Characteristic as CharacteristicConstructor;
    const Svc = api.hap.Service as typeof Service;

    this.options = new ConfigurationService(log, config).options;
    attachFileLogger(log, this.options);

    const defaultState = this.modeToStateVal(this.options.defaultMode);
    this.state = this.buildState(defaultState);

    this.svcs = this.buildServices(Svc, Char);
    this.state.availableTargetStates = this.calcAvailableStates(Char);

    // Sync main service initial values.
    this.svcs.mainService.getCharacteristic(Char.SecuritySystemTargetState).value = this.state.targetState;
    this.svcs.mainService.getCharacteristic(Char.SecuritySystemCurrentState).value = this.state.currentState;
    this.svcs.mainService
      .setCharacteristic(Char.ConfiguredName, this.options.name)
      .getCharacteristic(Char.SecuritySystemTargetState)
      .setProps({ validValues: this.state.availableTargetStates });

    // Services.
    this.bus = new EventBusService();
    this.storageService = new StorageService(log, this.options, api.user.storagePath());
    this.audioService = new AudioService(log, this.options, this.state, () =>
      Boolean(this.svcs.audioSwitchService.getCharacteristic(Char.On).value),
    );
    this.sensorHandler = new SensorHandler(this.svcs, Char, log);
    this.switchHandler = new SwitchHandler(this.svcs, this.state, this.options, Char, log);
    this.stateHandler = new StateHandler(
      this.svcs, this.state, this.options, Char, log, this.bus, this.storageService, this.audioService,
    );
    this.tripHandler = new TripHandler(
      this.svcs, this.state, this.options, Char, log, this.bus, this.audioService, this.sensorHandler,
    );

    // Wire circular deps.
    this.stateHandler.setHandlers(this.tripHandler, this.switchHandler, this.sensorHandler);
    this.switchHandler.setStateHandler(this.stateHandler);
    this.tripHandler.setStateHandler(this.stateHandler);

    // Attach side-effect listeners.
    this.audioService.attachToBus(this.bus);
    const webhookSvc = new WebhookService(log, this.options, this.state);
    const commandSvc = new CommandService(log, this.options, this.state);
    webhookSvc.attachToBus(this.bus);
    commandSvc.attachToBus(this.bus);

    // Register HomeKit handlers.
    this.registerHandlers(Char);

    // Build the exposed service list.
    this.serviceList = this.buildServiceList();

    // Startup tasks.
    this.logStartup();

    if (this.options.saveState) {
      this.storageService.init().then(() => this.storageService.load(this.state).then(() => {
        this.svcs.mainService.updateCharacteristic(Char.SecuritySystemTargetState, this.state.targetState);
        this.svcs.mainService.updateCharacteristic(Char.SecuritySystemCurrentState, this.state.currentState);
        this.stateHandler.logMode('Current', this.state.currentState);
      }));
    }

    if (this.options.audioPath) {
      this.audioService.setup();
    }

    if (this.options.serverPort !== null) {
      new ServerService(log, this.options, this.state, this.stateHandler, this.tripHandler, this.switchHandler).start();
    }
  }

  getServices(): Service[] {
    return this.serviceList;
  }

  identify(): void {
    this.log.info('Identify');
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private buildState(defaultState: SecurityState): SystemState {
    return {
      currentState: defaultState,
      targetState: defaultState,
      defaultState,
      availableTargetStates: [],
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
    };
  }

  private buildServices(Svc: typeof Service, Char: CharacteristicConstructor): ServiceRegistry {
    const sw = (name: string, sub: string) => {
      const s = new Svc.Switch(name, sub);
      s.addCharacteristic(Char.ConfiguredName);
      s.setCharacteristic(Char.ConfiguredName, name);
      return s;
    };
    const sensor = (name: string, sub: string) => {
      const s = new Svc.MotionSensor(name, sub);
      s.addOptionalCharacteristic(Char.ConfiguredName);
      s.setCharacteristic(Char.ConfiguredName, name);
      return s;
    };
    const o = this.options;

    const mainSvc = new Svc.SecuritySystem(o.name);
    mainSvc.addCharacteristic(Char.ConfiguredName);

    const infoSvc = new Svc.AccessoryInformation();
    infoSvc.setCharacteristic(Char.Identify, true);
    infoSvc.setCharacteristic(Char.Manufacturer, 'MiguelRipoll23');
    infoSvc.setCharacteristic(Char.Model, 'DIY');
    infoSvc.setCharacteristic(Char.SerialNumber, o.serialNumber);

    const audioSvc = sw(o.audioSwitchName, SWITCH_UUIDS.AUDIO);
    audioSvc.getCharacteristic(Char.On).value = true;

    return {
      mainService: mainSvc,
      accessoryInfoService: infoSvc,
      tripSwitchService: sw(o.tripSwitchName, SWITCH_UUIDS.TRIP),
      tripHomeSwitchService: sw(o.tripHomeSwitchName, SWITCH_UUIDS.TRIP_HOME),
      tripAwaySwitchService: sw(o.tripAwaySwitchName, SWITCH_UUIDS.TRIP_AWAY),
      tripNightSwitchService: sw(o.tripNightSwitchName, SWITCH_UUIDS.TRIP_NIGHT),
      tripOverrideSwitchService: sw(o.tripOverrideSwitchName, SWITCH_UUIDS.TRIP_OVERRIDE),
      armingLockSwitchService: sw('Arming Lock', SWITCH_UUIDS.ARMING_LOCK),
      armingLockHomeSwitchService: sw('Arming Lock Home', SWITCH_UUIDS.ARMING_LOCK_HOME),
      armingLockAwaySwitchService: sw('Arming Lock Away', SWITCH_UUIDS.ARMING_LOCK_AWAY),
      armingLockNightSwitchService: sw('Arming Lock Night', SWITCH_UUIDS.ARMING_LOCK_NIGHT),
      modeHomeSwitchService: sw(o.modeHomeSwitchName, SWITCH_UUIDS.MODE_HOME),
      modeAwaySwitchService: sw(o.modeAwaySwitchName, SWITCH_UUIDS.MODE_AWAY),
      modeNightSwitchService: sw(o.modeNightSwitchName, SWITCH_UUIDS.MODE_NIGHT),
      modeOffSwitchService: sw(o.modeOffSwitchName, SWITCH_UUIDS.MODE_OFF),
      modeAwayExtendedSwitchService: sw(o.modeAwayExtendedSwitchName, SWITCH_UUIDS.MODE_AWAY_EXTENDED),
      modePauseSwitchService: sw(o.modePauseSwitchName, SWITCH_UUIDS.MODE_PAUSE),
      audioSwitchService: audioSvc,
      armingMotionSensorService: sensor('Arming', SWITCH_UUIDS.ARMING_SENSOR),
      trippedMotionSensorService: sensor('Tripped', SWITCH_UUIDS.TRIPPED_SENSOR),
      triggeredMotionSensorService: sensor('Triggered', SWITCH_UUIDS.TRIGGERED_SENSOR),
      triggeredResetMotionSensorService: sensor('Triggered Reset', SWITCH_UUIDS.RESET_SENSOR),
    };
  }

  private registerHandlers(Char: CharacteristicConstructor): void {
    const s = this.svcs;
    const HK_ERR = HK_NOT_ALLOWED_IN_CURRENT_STATE;

    // Main security system.
    s.mainService.getCharacteristic(Char.SecuritySystemCurrentState)
      .onGet(async (): Promise<CharacteristicValue> => this.state.currentState);
    s.mainService.getCharacteristic(Char.SecuritySystemTargetState)
      .onGet(async (): Promise<CharacteristicValue> => this.state.targetState)
      .onSet(async (v: CharacteristicValue) => {
        this.stateHandler.updateTargetState(v as SecurityState, OriginType.REGULAR_SWITCH, this.stateHandler.getArmingSeconds(v as SecurityState));
      });

    // Trip switches.
    const tripSetHandler = (v: CharacteristicValue, origin: OriginType) => {
      const ok = this.tripHandler.updateTripSwitch(v as boolean, origin, false);
      if (!ok) {
        throw new this.api.hap.HapStatusError(HK_ERR as HAPStatus); 
      }
    };

    s.tripSwitchService.getCharacteristic(Char.On)
      .onGet(async () => Boolean(s.tripSwitchService.getCharacteristic(Char.On).value))
      .onSet(async (v) => {
        this.log.info(`Trip Switch (${v ? 'On' : 'Off'})`); tripSetHandler(v, OriginType.REGULAR_SWITCH); 
      });

    const modeTrips: Array<[keyof ServiceRegistry, SecurityState, string]> = [
      ['tripHomeSwitchService', SecurityState.HOME, 'Trip Home'],
      ['tripAwaySwitchService', SecurityState.AWAY, 'Trip Away'],
      ['tripNightSwitchService', SecurityState.NIGHT, 'Trip Night'],
    ];
    for (const [key, mode, label] of modeTrips) {
      const svc = s[key];
      svc.getCharacteristic(Char.On)
        .onGet(async () => Boolean(svc.getCharacteristic(Char.On).value))
        .onSet(async (v) => {
          this.log.info(`${label} Switch (${v ? 'On' : 'Off'})`);
          const ok = this.tripHandler.triggerIfModeSet(mode, v as boolean);
          if (!ok) {
            throw new this.api.hap.HapStatusError(HK_ERR as HAPStatus); 
          }
        });
    }

    s.tripOverrideSwitchService.getCharacteristic(Char.On)
      .onGet(async () => Boolean(s.tripOverrideSwitchService.getCharacteristic(Char.On).value))
      .onSet(async (v) => {
        this.log.info(`Trip Override Switch (${v ? 'On' : 'Off'})`); tripSetHandler(v, OriginType.OVERRIDE_SWITCH); 
      });

    // Mode switches.
    const modeSwitches: Array<[keyof ServiceRegistry, SecurityState | null, string]> = [
      ['modeHomeSwitchService', SecurityState.HOME, 'Mode Home'],
      ['modeAwaySwitchService', SecurityState.AWAY, 'Mode Away'],
      ['modeNightSwitchService', SecurityState.NIGHT, 'Mode Night'],
      ['modeOffSwitchService', null, 'Mode Off'],
    ];
    for (const [key, mode, label] of modeSwitches) {
      const svc = s[key];
      svc.getCharacteristic(Char.On)
        .onGet(async () => Boolean(svc.getCharacteristic(Char.On).value))
        .onSet(async (v) => {
          this.log.info(`${label} Switch (${v ? 'On' : 'Off'})`);
          const err = mode !== null ? this.switchHandler.setModeSwitch(mode, v as boolean) : this.switchHandler.setModeOffSwitch(v as boolean);
          if (err) {
            throw new this.api.hap.HapStatusError(err as HAPStatus); 
          }
        });
    }

    s.modeAwayExtendedSwitchService.getCharacteristic(Char.On)
      .onGet(async () => Boolean(s.modeAwayExtendedSwitchService.getCharacteristic(Char.On).value))
      .onSet(async (v) => {
        const err = this.switchHandler.setModeAwayExtendedSwitch(v as boolean);
        if (err) {
          throw new this.api.hap.HapStatusError(err as HAPStatus); 
        }
      });

    s.modePauseSwitchService.getCharacteristic(Char.On)
      .onGet(async () => Boolean(s.modePauseSwitchService.getCharacteristic(Char.On).value))
      .onSet(async (v) => {
        const err = this.switchHandler.setModePauseSwitch(v as boolean);
        if (err) {
          throw new this.api.hap.HapStatusError(err as HAPStatus); 
        }
      });

    // Arming lock switches.
    const lockSwitches: Array<[keyof ServiceRegistry, string]> = [
      ['armingLockSwitchService', 'global'],
      ['armingLockHomeSwitchService', 'home'],
      ['armingLockAwaySwitchService', 'away'],
      ['armingLockNightSwitchService', 'night'],
    ];
    for (const [key, mode] of lockSwitches) {
      const svc = s[key];
      svc.getCharacteristic(Char.On)
        .onGet(async () => Boolean(svc.getCharacteristic(Char.On).value))
        .onSet(async (v) => this.log.info(`Arming lock [${mode}] (${v ? 'On' : 'Off'})`));
    }

    // Audio switch.
    s.audioSwitchService.getCharacteristic(Char.On)
      .onGet(async () => Boolean(s.audioSwitchService.getCharacteristic(Char.On).value))
      .onSet(async (v) => this.log.info(`Audio (${v ? 'Enabled' : 'Disabled'})`));

    // Motion sensors (read-only).
    const sensorKeys = ['armingMotionSensorService', 'trippedMotionSensorService',
      'triggeredMotionSensorService', 'triggeredResetMotionSensorService'] as const;
    for (const key of sensorKeys) {
      s[key].getCharacteristic(Char.MotionDetected)
        .onGet(async () => Boolean(s[key].getCharacteristic(Char.MotionDetected).value));
    }
  }

  private buildServiceList(): Service[] {
    const s = this.svcs;
    const o = this.options;
    const avail = this.state.availableTargetStates;
    const list: Service[] = [s.mainService, s.accessoryInfoService];

    if (o.armingMotionSensor) {
      list.push(s.armingMotionSensorService); 
    }
    if (o.trippedMotionSensor) {
      list.push(s.trippedMotionSensorService); 
    }
    if (o.triggeredMotionSensor) {
      list.push(s.triggeredMotionSensorService); 
    }
    if (o.resetSensor) {
      list.push(s.triggeredResetMotionSensorService); 
    }
    if (o.armingLockSwitch) {
      list.push(s.armingLockSwitchService); 
    }
    if (o.armingLockSwitches) {
      list.push(s.armingLockHomeSwitchService, s.armingLockAwaySwitchService, s.armingLockNightSwitchService);
    }
    if (o.tripSwitch) {
      list.push(s.tripSwitchService); 
    }
    if (o.tripOverrideSwitch) {
      list.push(s.tripOverrideSwitchService); 
    }

    if (avail.includes(SecurityState.HOME)) {
      if (o.modeSwitches) {
        list.push(s.modeHomeSwitchService); 
      }
      if (o.tripModeSwitches) {
        list.push(s.tripHomeSwitchService); 
      }
    }
    if (avail.includes(SecurityState.AWAY)) {
      if (o.modeSwitches) {
        list.push(s.modeAwaySwitchService); 
      }
      if (o.tripModeSwitches) {
        list.push(s.tripAwaySwitchService); 
      }
    }
    if (avail.includes(SecurityState.NIGHT)) {
      if (o.modeSwitches) {
        list.push(s.modeNightSwitchService); 
      }
      if (o.tripModeSwitches) {
        list.push(s.tripNightSwitchService); 
      }
    }

    if (o.modeSwitches && o.modeOffSwitch) {
      list.push(s.modeOffSwitchService); 
    }
    if (o.modeAwayExtendedSwitch) {
      list.push(s.modeAwayExtendedSwitchService); 
    }
    if (o.modePauseSwitch) {
      list.push(s.modePauseSwitchService); 
    }
    if (o.audio && o.audioSwitch) {
      list.push(s.audioSwitchService); 
    }

    return list;
  }

  private calcAvailableStates(Char: CharacteristicConstructor): SecurityState[] {
    const all = this.svcs.mainService
      .getCharacteristic(Char.SecuritySystemTargetState)
      .props.validValues ?? [0, 1, 2, 3];

    const disabled = this.options.disabledModes.map(m => {
      switch (m.toLowerCase()) {
      case 'home': return SecurityState.HOME;
      case 'away': return SecurityState.AWAY;
      case 'night': return SecurityState.NIGHT;
      case 'off': return SecurityState.OFF;
      default: return -1 as SecurityState;
      }
    });

    return (all as SecurityState[]).filter(s => !disabled.includes(s));
  }

  private modeToStateVal(mode: string): SecurityState {
    switch (mode) {
    case 'home': return SecurityState.HOME;
    case 'away': return SecurityState.AWAY;
    case 'night': return SecurityState.NIGHT;
    default: return SecurityState.OFF;
    }
  }

  private logStartup(): void {
    if (this.options.testMode) {
      this.log.warn('Test Mode'); 
    }
    stateToMode(this.state.defaultState);
    this.stateHandler.logMode('Default', this.state.defaultState);
    this.log.info(`Arm delay (${this.options.armSeconds}s)`);
    this.log.info(`Trigger delay (${this.options.triggerSeconds}s)`);
    this.log.info(`Audio (${this.options.audio ? 'Enabled' : 'Disabled'})`);
    if (this.options.proxyMode) {
      this.log.info('Proxy mode (Enabled)'); 
    }
    if (this.options.webhookUrl) {
      this.log.info(`Webhook (${this.options.webhookUrl})`); 
    }
  }
}
