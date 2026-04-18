import type { API, AccessoryPlugin, Logging, Service } from 'homebridge';
import type { CharacteristicConstructor } from './interfaces/hap-types-interface.js';
import { SecurityState } from './types/security-state-type.js';
import { OriginType } from './types/origin-type.js';
import { ConfigurationService } from './services/configuration-service.js';
import { attachFileLogger } from './utils/log-util.js';
import { stateToMode, modeToState } from './utils/state-util.js';
import type { SecuritySystemOptions } from './interfaces/options-interface.js';
import type { SystemState } from './interfaces/system-state-interface.js';
import type { ServiceRegistry } from './interfaces/service-registry-interface.js';
import { EventBusService } from './services/event-bus-service.js';
import { EventType } from './types/event-type.js';
import { StorageService } from './services/storage-service.js';
import { AudioService } from './services/audio-service.js';
import { WebhookService } from './services/webhook-service.js';
import { CommandService } from './services/command-service.js';
import { ServerService } from './services/server-service.js';
import { StateHandler } from './handlers/state-handler.js';
import { TripHandler } from './handlers/trip-handler.js';
import { SwitchHandler } from './handlers/switch-handler.js';
import { SensorHandler } from './handlers/sensor-handler.js';
import { buildServiceRegistry, buildServiceList } from './homekit/service-factory.js';
import { HomeKitRegistrar } from './homekit/homekit-registrar.js';
import { TimerManager } from './timers/timer-manager.js';

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

    const defaultState = modeToState(this.options.defaultMode);
    this.state = this.buildState(defaultState === (-1 as SecurityState) ? SecurityState.OFF : defaultState);

    this.svcs = buildServiceRegistry(Svc, Char, this.options);
    this.state.availableTargetStates = this.calcAvailableTargetStates();

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
    const timerManager = new TimerManager(log);

    // Handlers — construction order matters: sensorHandler first (leaf), then stateHandler,
    // then switchHandler (depends on stateHandler), then tripHandler.
    this.sensorHandler = new SensorHandler(this.svcs, Char, log);
    this.stateHandler = new StateHandler(
      this.svcs, this.state, this.options, Char, log, this.bus, this.storageService, this.audioService, timerManager, this.sensorHandler,
    );
    this.switchHandler = new SwitchHandler(this.svcs, this.state, this.options, Char, log, timerManager, this.stateHandler);
    this.tripHandler = new TripHandler(
      this.svcs, this.state, this.options, Char, log, this.bus, this.audioService, this.sensorHandler, timerManager,
    );

    // Wire bus listeners for cross-handler coordination (no more circular constructor deps).
    this.switchHandler.subscribeToStateEvents(this.bus);
    this.bus.on(EventType.RESET_TRIP_SWITCHES, () => this.tripHandler.resetTripSwitches());
    this.bus.on(EventType.TRIGGER_FIRED, ({ origin }) => {
      this.stateHandler.setCurrentState(SecurityState.TRIGGERED, origin);
    });
    this.bus.on(EventType.TRIP_CANCELLED, ({ stateChanged }) => {
      if (this.state.currentState === SecurityState.TRIGGERED && !stateChanged) {
        this.stateHandler.updateTargetState(SecurityState.OFF, OriginType.INTERNAL, 0);
      } else {
        this.stateHandler.resetTimers();
      }
    });

    // Attach side-effect listeners.
    this.audioService.attachToBus(this.bus);
    const webhookSvc = new WebhookService(log, this.options, this.state);
    const commandSvc = new CommandService(log, this.options, this.state);
    webhookSvc.attachToBus(this.bus);
    commandSvc.attachToBus(this.bus);

    // Register HomeKit characteristic handlers.
    new HomeKitRegistrar(this.api, this.log, this.svcs, this.state, this.stateHandler, this.tripHandler, this.switchHandler)
      .register(Char);

    // Build the exposed service list.
    this.serviceList = buildServiceList(this.svcs, this.options, this.state);

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
      isTripping: false,
      isKnocked: false,
      serverAuthenticationAttempts: 0,
      pausedCurrentState: null,
      audioProcess: null,
    };
  }

  private calcAvailableTargetStates(): SecurityState[] {
    const all = [SecurityState.HOME, SecurityState.AWAY, SecurityState.NIGHT, SecurityState.OFF];
    const disabled = this.options.disabledModes.map(m => modeToState(m.toLowerCase()));
    return all.filter(s => !disabled.includes(s));
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
