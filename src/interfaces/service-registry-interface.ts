import type { Service } from 'homebridge';

/**
 * HomeKit services exposed by the security system accessory.
 * Switches and motion sensors are published over Matter only, so the HomeKit
 * accessory carries just the security system itself.
 */
export interface ServiceRegistry {
  mainService: Service;
  accessoryInfoService: Service;
}