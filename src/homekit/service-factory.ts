import type { Service } from 'homebridge';
import type { CharacteristicConstructor } from '../interfaces/hap-types-interface.js';
import type { SecuritySystemOptions } from '../interfaces/options-interface.js';
import type { ServiceRegistry } from '../interfaces/service-registry-interface.js';
import type { SystemState } from '../interfaces/system-state-interface.js';
import { SecurityState } from '../types/security-state-type.js';
import { SWITCH_UUIDS } from '../constants/switch-uuid-constant.js';

/** Creates the complete ServiceRegistry of HomeKit services for the accessory. */
export function buildServiceRegistry(
  Svc: typeof Service,
  Char: CharacteristicConstructor,
  options: SecuritySystemOptions,
): ServiceRegistry {
  const sw = (name: string, sub: string): Service => {
    const s = new Svc.Switch(name, sub);
    s.addCharacteristic(Char.ConfiguredName);
    s.setCharacteristic(Char.ConfiguredName, name);
    return s;
  };
  const sensor = (name: string, sub: string): Service => {
    const s = new Svc.MotionSensor(name, sub);
    s.addOptionalCharacteristic(Char.ConfiguredName);
    s.setCharacteristic(Char.ConfiguredName, name);
    return s;
  };

  const mainSvc = new Svc.SecuritySystem(options.name);
  mainSvc.addCharacteristic(Char.ConfiguredName);

  const infoSvc = new Svc.AccessoryInformation();
  infoSvc.setCharacteristic(Char.Identify, true);
  infoSvc.setCharacteristic(Char.Manufacturer, 'MiguelRipoll23');
  infoSvc.setCharacteristic(Char.Model, 'DIY');
  infoSvc.setCharacteristic(Char.SerialNumber, options.serialNumber);

  const audioSvc = sw(options.audioSwitchName, SWITCH_UUIDS.AUDIO);
  audioSvc.getCharacteristic(Char.On).value = true;

  return {
    mainService: mainSvc,
    accessoryInfoService: infoSvc,
    tripSwitchService: sw(options.tripSwitchName, SWITCH_UUIDS.TRIP),
    tripHomeSwitchService: sw(options.tripHomeSwitchName, SWITCH_UUIDS.TRIP_HOME),
    tripAwaySwitchService: sw(options.tripAwaySwitchName, SWITCH_UUIDS.TRIP_AWAY),
    tripNightSwitchService: sw(options.tripNightSwitchName, SWITCH_UUIDS.TRIP_NIGHT),
    tripOverrideSwitchService: sw(options.tripOverrideSwitchName, SWITCH_UUIDS.TRIP_OVERRIDE),
    armingLockSwitchService: sw('Arming Lock', SWITCH_UUIDS.ARMING_LOCK),
    armingLockHomeSwitchService: sw('Arming Lock Home', SWITCH_UUIDS.ARMING_LOCK_HOME),
    armingLockAwaySwitchService: sw('Arming Lock Away', SWITCH_UUIDS.ARMING_LOCK_AWAY),
    armingLockNightSwitchService: sw('Arming Lock Night', SWITCH_UUIDS.ARMING_LOCK_NIGHT),
    modeHomeSwitchService: sw(options.modeHomeSwitchName, SWITCH_UUIDS.MODE_HOME),
    modeAwaySwitchService: sw(options.modeAwaySwitchName, SWITCH_UUIDS.MODE_AWAY),
    modeNightSwitchService: sw(options.modeNightSwitchName, SWITCH_UUIDS.MODE_NIGHT),
    modeOffSwitchService: sw(options.modeOffSwitchName, SWITCH_UUIDS.MODE_OFF),
    modeAwayExtendedSwitchService: sw(options.modeAwayExtendedSwitchName, SWITCH_UUIDS.MODE_AWAY_EXTENDED),
    modePauseSwitchService: sw(options.modePauseSwitchName, SWITCH_UUIDS.MODE_PAUSE),
    audioSwitchService: audioSvc,
    armingMotionSensorService: sensor('Arming', SWITCH_UUIDS.ARMING_SENSOR),
    trippedMotionSensorService: sensor('Tripped', SWITCH_UUIDS.TRIPPED_SENSOR),
    triggeredMotionSensorService: sensor('Triggered', SWITCH_UUIDS.TRIGGERED_SENSOR),
    triggeredResetMotionSensorService: sensor('Triggered Reset', SWITCH_UUIDS.RESET_SENSOR),
  };
}

/** Builds the list of services to expose to HomeKit based on configured options. */
export function buildServiceList(
  svcs: ServiceRegistry,
  options: SecuritySystemOptions,
  state: Pick<SystemState, 'availableTargetStates'>,
): Service[] {
  const avail = state.availableTargetStates;
  const list: Service[] = [svcs.mainService, svcs.accessoryInfoService];

  if (options.armingMotionSensor) {
    list.push(svcs.armingMotionSensorService);
  }
  if (options.trippedMotionSensor) {
    list.push(svcs.trippedMotionSensorService);
  }
  if (options.triggeredMotionSensor) {
    list.push(svcs.triggeredMotionSensorService);
  }
  if (options.resetSensor) {
    list.push(svcs.triggeredResetMotionSensorService);
  }
  if (options.armingLockSwitch) {
    list.push(svcs.armingLockSwitchService);
  }
  if (options.armingLockSwitches) {
    list.push(svcs.armingLockHomeSwitchService, svcs.armingLockAwaySwitchService, svcs.armingLockNightSwitchService);
  }
  if (options.tripSwitch) {
    list.push(svcs.tripSwitchService);
  }
  if (options.tripOverrideSwitch) {
    list.push(svcs.tripOverrideSwitchService);
  }

  if (avail.includes(SecurityState.HOME)) {
    if (options.modeSwitches) {
      list.push(svcs.modeHomeSwitchService);
    }
    if (options.tripModeSwitches) {
      list.push(svcs.tripHomeSwitchService);
    }
  }
  if (avail.includes(SecurityState.AWAY)) {
    if (options.modeSwitches) {
      list.push(svcs.modeAwaySwitchService);
    }
    if (options.tripModeSwitches) {
      list.push(svcs.tripAwaySwitchService);
    }
  }
  if (avail.includes(SecurityState.NIGHT)) {
    if (options.modeSwitches) {
      list.push(svcs.modeNightSwitchService);
    }
    if (options.tripModeSwitches) {
      list.push(svcs.tripNightSwitchService);
    }
  }

  if (options.modeSwitches && options.modeOffSwitch) {
    list.push(svcs.modeOffSwitchService);
  }
  if (options.modeAwayExtendedSwitch) {
    list.push(svcs.modeAwayExtendedSwitchService);
  }
  if (options.modePauseSwitch) {
    list.push(svcs.modePauseSwitchService);
  }
  if (options.audio && options.audioSwitch) {
    list.push(svcs.audioSwitchService);
  }

  return list;
}
