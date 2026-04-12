import type { Logging } from 'homebridge';
import type { CharacteristicConstructor } from '../interfaces/hap-types-interface.js';
import { SecurityState } from '../types/security-state-type.js';
import { OriginType } from '../types/origin-type.js';
import { HK_NOT_ALLOWED_IN_CURRENT_STATE } from '../constants/homekit-constant.js';
import type { ServiceRegistry } from '../interfaces/service-registry-interface.js';
import type { SystemState } from '../interfaces/system-state-interface.js';
import type { SecuritySystemOptions } from '../interfaces/options-interface.js';
import type { EventBusService } from '../services/event-bus-service.js';
import { EventType } from '../types/event-type.js';
import type { AudioService } from '../services/audio-service.js';
import type { SensorHandler } from './sensor-handler.js';
import type { StateHandler } from './state-handler.js';
import type { Condition } from '../conditions/condition.js';
import type { TimerManager } from '../timers/timer-manager.js';
import type { ConditionContext } from '../interfaces/condition-context-interface.js';
import { NotArmedCondition } from '../conditions/not-armed-condition.js';
import { ArmingInProgressCondition } from '../conditions/arming-in-progress-condition.js';
import { AlreadyTriggeredCondition } from '../conditions/already-triggered-condition.js';
import { DoubleKnockCondition } from '../conditions/double-knock-condition.js';
import { TriggerAlreadyRunningCondition } from '../conditions/trigger-already-running-condition.js';

/** Handles the trip switch and trigger-delay logic, including all blocking conditions. */
export class TripHandler {
  private stateHandler!: StateHandler;

  private readonly conditions: readonly Condition[];

  constructor(
    private readonly services: ServiceRegistry,
    private readonly state: SystemState,
    private readonly options: SecuritySystemOptions,
    private readonly Characteristic: CharacteristicConstructor,
    private readonly log: Logging,
    private readonly bus: EventBusService,
    private readonly audio: AudioService,
    private readonly sensorHandler: SensorHandler,
    private readonly timers: TimerManager,
  ) {
    const doubleKnock = new DoubleKnockCondition(
      (seconds, onExpire) => {
        this.timers.setDoubleKnockTimer(seconds * 1000, onExpire);
      },
      () => {
        this.timers.clearDoubleKnockTimer();
      },
    );

    this.conditions = [
      new NotArmedCondition(),
      new ArmingInProgressCondition(),
      doubleKnock,
      new AlreadyTriggeredCondition(),
      new TriggerAlreadyRunningCondition(),
    ];
  }

  setStateHandler(handler: StateHandler): void {
    this.stateHandler = handler;
  }

  /**
   * Core trip-switch logic shared by all trip/trigger paths.
   * Returns `true` on success, `false` if blocked.
   */
  updateTripSwitch(value: boolean, origin: OriginType, stateChanged: boolean): boolean {
    const ctx: ConditionContext = {
      state: this.state,
      services: this.services,
      options: this.options,
      value,
      origin,
      log: this.log,
    };

    if (value) {
      for (const condition of this.conditions) {
        if (condition.evaluate(ctx)) {
          return false;
        }
      }

      this.activateTrip(origin);
    } else {
      this.cancelTrip(origin, stateChanged);
    }

    // Sync trip switch characteristic when origin is not a direct switch press.
    if (origin === OriginType.INTERNAL || origin === OriginType.EXTERNAL) {
      this.services.tripSwitchService.updateCharacteristic(this.Characteristic.On, value);
    }

    return true;
  }

  /**
   * Trip a mode-specific switch. Only triggers if the system is currently in
   * the required mode (or the alarm is triggered and target matches).
   */
  triggerIfModeSet(requiredState: SecurityState, value: boolean): boolean {
    const isTriggered = this.state.currentState === SecurityState.TRIGGERED;

    if (value) {
      const modeMatches = this.state.currentState === requiredState
        || (isTriggered && this.state.targetState === requiredState);

      if (!modeMatches) {
        this.log.debug('Security System (Trip mode not set)');
        return false;
      }
    }

    return this.updateTripSwitch(value, OriginType.REGULAR_SWITCH, false);
  }

  resetTripSwitches(): void {
    const switches: Array<[keyof ServiceRegistry, string]> = [
      ['tripHomeSwitchService', 'Trip Home'],
      ['tripAwaySwitchService', 'Trip Away'],
      ['tripNightSwitchService', 'Trip Night'],
      ['tripOverrideSwitchService', 'Trip Override'],
    ];

    for (const [key, label] of switches) {
      const char = this.services[key].getCharacteristic(this.Characteristic.On);
      if (char.value) {
        char.updateValue(false);
        this.log.debug(`${label} Switch (Off)`);
      }
    }
  }

  private activateTrip(origin: OriginType): void {
    this.log.info('Security System (Tripped)');

    if (this.options.trippedMotionSensor) {
      this.sensorHandler.pulseTrippedMotionSensor();
      this.timers.setTrippedInterval(
        this.options.trippedMotionSensorSeconds * 1000,
        () => this.sensorHandler.pulseTrippedMotionSensor(),
      );
    }

    const triggerSeconds = this.resolveTriggerSeconds();
    this.log.debug(`Trigger delay (${triggerSeconds}s)`);

    this.state.isTripping = true;
    this.timers.setTriggerTimer(triggerSeconds * 1000, () => {
      this.state.isTripping = false;
      this.stateHandler.setCurrentState(SecurityState.TRIGGERED, origin);
    });

    if (triggerSeconds > 0) {
      this.bus.emit(EventType.WARNING, { origin, triggerSeconds });
    }
  }

  private cancelTrip(origin: OriginType, stateChanged: boolean): void {
    this.log.info('Security System (Cancelled)');
    this.state.isTripping = false;
    this.audio.stop();

    if (this.state.currentState === SecurityState.TRIGGERED) {
      if (!stateChanged) {
        this.stateHandler.updateTargetState(SecurityState.OFF, OriginType.INTERNAL, 0);
      }
    } else {
      this.stateHandler.resetTimers();
    }

    if (this.options.trippedMotionSensor) {
      this.sensorHandler.resetTrippedMotionSensor();
    }

    this.state.isKnocked = false;
  }

  private resolveTriggerSeconds(): number {
    const seconds = this.options.triggerSeconds;
    const cur = this.state.currentState;

    if (cur === SecurityState.HOME && this.options.homeTriggerSeconds !== null) {
      return this.options.homeTriggerSeconds;
    }

    if (cur === SecurityState.AWAY) {
      const extChar = this.services.modeAwayExtendedSwitchService
        .getCharacteristic(this.Characteristic.On);

      if (this.options.modeAwayExtendedSwitchTriggerSeconds !== null && extChar.value) {
        return this.options.modeAwayExtendedSwitchTriggerSeconds;
      }

      if (this.options.awayTriggerSeconds !== null) {
        return this.options.awayTriggerSeconds;
      }
    }

    if (cur === SecurityState.NIGHT && this.options.nightTriggerSeconds !== null) {
      return this.options.nightTriggerSeconds;
    }

    return seconds;
  }
}

export { HK_NOT_ALLOWED_IN_CURRENT_STATE };
