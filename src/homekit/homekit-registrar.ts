import type { API, Logging, CharacteristicValue, Service } from 'homebridge';
import { HAPStatus } from 'homebridge';
import type { CharacteristicConstructor } from '../interfaces/hap-types-interface.js';
import type { ServiceRegistry } from '../interfaces/service-registry-interface.js';
import type { SystemState } from '../interfaces/system-state-interface.js';
import { SecurityState } from '../types/security-state-type.js';
import { OriginType } from '../types/origin-type.js';
import { HK_NOT_ALLOWED_IN_CURRENT_STATE } from '../constants/homekit-constant.js';
import type { StateHandler } from '../handlers/state-handler.js';
import type { TripHandler } from '../handlers/trip-handler.js';
import type { SwitchHandler } from '../handlers/switch-handler.js';

/** Attaches all HomeKit characteristic handlers (onGet / onSet) to their services. */
export class HomeKitRegistrar {
  constructor(
    private readonly api: API,
    private readonly log: Logging,
    private readonly svcs: ServiceRegistry,
    private readonly state: SystemState,
    private readonly stateHandler: StateHandler,
    private readonly tripHandler: TripHandler,
    private readonly switchHandler: SwitchHandler,
  ) {}

  register(Char: CharacteristicConstructor): void {
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
      .onSet(async (v: CharacteristicValue) => {
        this.log.info(`Trip Switch (${v ? 'On' : 'Off'})`);
        tripSetHandler(v, OriginType.REGULAR_SWITCH);
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
        .onSet(async (v: CharacteristicValue) => {
          this.log.info(`${label} Switch (${v ? 'On' : 'Off'})`);
          const ok = this.tripHandler.triggerIfModeSet(mode, v as boolean);
          if (!ok) {
            throw new this.api.hap.HapStatusError(HK_ERR as HAPStatus);
          }
        });
    }

    const customModeTrips: Array<[Service[], SecurityState]> = [
      [s.customTripHomeSwitchServices, SecurityState.HOME],
      [s.customTripAwaySwitchServices, SecurityState.AWAY],
      [s.customTripNightSwitchServices, SecurityState.NIGHT],
    ];
    for (const [services, mode] of customModeTrips) {
      for (const svc of services) {
        const name = String(svc.getCharacteristic(Char.ConfiguredName).value ?? 'Custom Trip');
        svc.getCharacteristic(Char.On)
          .onGet(async () => Boolean(svc.getCharacteristic(Char.On).value))
          .onSet(async (v: CharacteristicValue) => {
            this.log.info(`${name} Switch (${v ? 'On' : 'Off'})`);
            const ok = this.tripHandler.triggerIfModeSet(mode, v as boolean);
            if (!ok) {
              throw new this.api.hap.HapStatusError(HK_ERR as HAPStatus);
            }
          });
      }
    }

    s.tripOverrideSwitchService.getCharacteristic(Char.On)
      .onGet(async () => Boolean(s.tripOverrideSwitchService.getCharacteristic(Char.On).value))
      .onSet(async (v: CharacteristicValue) => {
        this.log.info(`Trip Override Switch (${v ? 'On' : 'Off'})`);
        tripSetHandler(v, OriginType.OVERRIDE_SWITCH);
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
        .onSet(async (v: CharacteristicValue) => {
          this.log.info(`${label} Switch (${v ? 'On' : 'Off'})`);
          const err = mode !== null
            ? this.switchHandler.setModeSwitch(mode, v as boolean)
            : this.switchHandler.setModeOffSwitch(v as boolean);
          if (err) {
            throw new this.api.hap.HapStatusError(err as HAPStatus);
          }
        });
    }

    s.modeAwayExtendedSwitchService.getCharacteristic(Char.On)
      .onGet(async () => Boolean(s.modeAwayExtendedSwitchService.getCharacteristic(Char.On).value))
      .onSet(async (v: CharacteristicValue) => {
        const err = this.switchHandler.setModeAwayExtendedSwitch(v as boolean);
        if (err) {
          throw new this.api.hap.HapStatusError(err as HAPStatus);
        }
      });

    s.modePauseSwitchService.getCharacteristic(Char.On)
      .onGet(async () => Boolean(s.modePauseSwitchService.getCharacteristic(Char.On).value))
      .onSet(async (v: CharacteristicValue) => {
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
        .onSet(async (v: CharacteristicValue) => this.log.info(`Arming lock [${mode}] (${v ? 'On' : 'Off'})`));
    }

    // Audio switch.
    s.audioSwitchService.getCharacteristic(Char.On)
      .onGet(async () => Boolean(s.audioSwitchService.getCharacteristic(Char.On).value))
      .onSet(async (v: CharacteristicValue) => this.log.info(`Audio (${v ? 'Enabled' : 'Disabled'})`));

    // Motion sensors (read-only).
    const sensorKeys = [
      'armingMotionSensorService', 'trippedMotionSensorService',
      'triggeredMotionSensorService', 'triggeredResetMotionSensorService',
    ] as const;
    for (const key of sensorKeys) {
      s[key].getCharacteristic(Char.MotionDetected)
        .onGet(async () => Boolean(s[key].getCharacteristic(Char.MotionDetected).value));
    }
  }
}
