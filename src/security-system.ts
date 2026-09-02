import type { API, Logging, MatterAccessory, PlatformAccessory, Service } from 'homebridge';
import type { CharacteristicConstructor } from './interfaces/hap-types-interface.js';
import { SecurityState } from './types/security-state-type.js';
import { OriginType } from './types/origin-type.js';
import { ConfigurationService } from './services/configuration-service.js';
import { stateToMode, modeToState } from './utils/state-util.js';
import type { SecuritySystemOptions } from './interfaces/options-interface.js';
import type { SystemState } from './interfaces/system-state-interface.js';
import type { ServiceRegistry } from './interfaces/service-registry-interface.js';
import { EventBusService } from './services/event-bus-service.js';
import { EventType } from './types/event-type.js';
import { StorageService } from './services/storage-service.js';
import { WebhookService } from './services/webhook-service.js';
import { CommandService } from './services/command-service.js';
import { MqttService } from './services/mqtt-service.js';
import { MatterService } from './services/matter-service.js';
import { ServerService } from './services/server-service.js';
import { StateHandler } from './handlers/state-handler.js';
import { TripHandler } from './handlers/trip-handler.js';
import { SwitchHandler } from './handlers/switch-handler.js';
import { SensorHandler } from './handlers/sensor-handler.js';
import { buildServiceRegistry, buildServiceList } from './homekit/service-factory.js';
import { HomeKitRegistrar } from './homekit/homekit-registrar.js';
import { TimerManager } from './timers/timer-manager.js';

export class SecuritySystem {
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
  private readonly matterService: MatterService;

  constructor(
    private readonly log: Logging,
    config: Record<string, unknown>,
    private readonly api: API,
    private readonly accessory: PlatformAccessory,
  ) {
    const Char = api.hap.Characteristic as CharacteristicConstructor;
    const Svc = api.hap.Service as typeof Service;

    this.options = new ConfigurationService(log, config).options;

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
    const timerManager = new TimerManager(log);

    // Handlers — construction order matters: sensorHandler first (leaf), then stateHandler,
    // then switchHandler (depends on stateHandler), then tripHandler.
    this.sensorHandler = new SensorHandler(log, this.bus);
    this.stateHandler = new StateHandler(
      this.svcs, this.state, this.options, Char, log, this.bus, this.storageService, timerManager, this.sensorHandler,
    );
    this.switchHandler = new SwitchHandler(this.state, this.options, log, timerManager, this.stateHandler);
    this.tripHandler = new TripHandler(
      this.state, this.options, log, this.bus, this.sensorHandler, timerManager,
    );

    // Wire bus listeners for cross-handler coordination (no more circular constructor deps).
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
    const webhookSvc = new WebhookService(log, this.options, this.state);
    const commandSvc = new CommandService(log, this.options, this.state);
    webhookSvc.attachToBus(this.bus);
    commandSvc.attachToBus(this.bus);
    const mqttSvc = new MqttService(log, this.options, this.state);
    mqttSvc.attachToBus(this.bus);
    this.api.on('shutdown', () => mqttSvc.disconnect());

    // Publish the optional switch/sensor accessories over Matter (HAP keeps the
    // main SecuritySystem service and the motion sensors). Registration happens
    // on the platform after didFinishLaunching, via setupMatterAccessories().
    this.matterService = new MatterService(log, this.options, api, this.state, this.switchHandler, this.tripHandler, this.sensorHandler);
    this.matterService.attachToBus(this.bus);

    // Register HomeKit characteristic handlers.
    new HomeKitRegistrar(this.svcs, this.state, this.stateHandler)
      .register(Char);

    // Build the exposed service list and host it on the platform accessory.
    this.serviceList = buildServiceList(this.svcs);
    this.populateAccessory();
    this.accessory.on('identify', () => this.log.info('Identify'));

    // Startup tasks.
    this.logStartup();

    const syncModeSwitches = (): void => {
      this.bus.emit(EventType.RESET_MODE_SWITCHES, {});
      this.bus.emit(EventType.UPDATE_MODE_SWITCHES, {});
    };

    if (this.options.saveState) {
      this.storageService.init().then(() => this.storageService.load(this.state).then(() => {
        this.svcs.mainService.updateCharacteristic(Char.SecuritySystemTargetState, this.state.targetState);
        this.svcs.mainService.updateCharacteristic(Char.SecuritySystemCurrentState, this.state.currentState);
        this.stateHandler.logMode('Current', this.state.currentState);
        syncModeSwitches();
      }));
    } else {
      syncModeSwitches();
    }

    if (this.options.serverPort !== null) {
      new ServerService(log, this.options, this.state, this.stateHandler, this.tripHandler, this.switchHandler).start();
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Registers all configured switch/sensor accessories over Matter.
   * No-op when Matter is disabled on the bridge.
   */
  setupMatterAccessories(cachedAccessories: Map<string, MatterAccessory>): Promise<void> {
    return this.matterService.registerAccessories(cachedAccessories);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Replaces any existing services (from a restored cached accessory) with fresh
   * instances and adds all exposed services exactly once. addService() throws if
   * the accessory already carries a service with the same UUID without subtype,
   * so stale services are matched by UUID and removed beforehand (getService()
   * matches display names, not UUIDs, and is therefore useless here).
   */
  private populateAccessory(): void {
    this.accessory.updateDisplayName(this.options.name);
    for (const service of this.serviceList) {
      for (const existingService of this.accessory.services.filter(existing => existing.UUID === service.UUID)) {
        this.accessory.removeService(existingService);
      }
      this.accessory.addService(service);
    }
  }

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
      armingLocks: { global: false, home: false, away: false, night: false },
      modeAwayExtended: false,
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
    if (this.options.proxyMode) {
      this.log.info('Proxy mode (Enabled)');
    }
  }
}
