import type { Service } from 'homebridge';

/** All HomeKit services exposed by the security system accessory. */
export interface ServiceRegistry {
  mainService: Service;
  accessoryInfoService: Service;

  // Trip switches
  tripSwitchService: Service;
  tripHomeSwitchService: Service;
  tripAwaySwitchService: Service;
  tripNightSwitchService: Service;
  tripOverrideSwitchService: Service;

  // Arming lock switches
  armingLockSwitchService: Service;
  armingLockHomeSwitchService: Service;
  armingLockAwaySwitchService: Service;
  armingLockNightSwitchService: Service;

  // Mode switches
  modeHomeSwitchService: Service;
  modeAwaySwitchService: Service;
  modeNightSwitchService: Service;
  modeOffSwitchService: Service;
  modeAwayExtendedSwitchService: Service;
  modePauseSwitchService: Service;

  // Custom trip mode switches (dynamic, one per configured entry)
  customTripHomeSwitchServices: Service[];
  customTripAwaySwitchServices: Service[];
  customTripNightSwitchServices: Service[];

  // Audio switch
  audioSwitchService: Service;

  // Motion sensors
  armingMotionSensorService: Service;
  trippedMotionSensorService: Service;
  triggeredMotionSensorService: Service;
  triggeredResetMotionSensorService: Service;
}
