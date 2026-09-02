import type { Service } from 'homebridge';
import type { CharacteristicConstructor } from '../interfaces/hap-types-interface.js';
import type { SecuritySystemOptions } from '../interfaces/options-interface.js';
import type { ServiceRegistry } from '../interfaces/service-registry-interface.js';

/**
 * Creates the HomeKit services for the accessory. Switches and motion sensors
 * are published over Matter only, so the HomeKit accessory only carries the
 * security system service and its accessory information service.
 */
export function buildServiceRegistry(
  Svc: typeof Service,
  Char: CharacteristicConstructor,
  options: SecuritySystemOptions,
): ServiceRegistry {
  const mainSvc = new Svc.SecuritySystem(options.name);
  mainSvc.addCharacteristic(Char.ConfiguredName);

  const infoSvc = new Svc.AccessoryInformation();
  infoSvc.setCharacteristic(Char.Name, options.name);
  infoSvc.setCharacteristic(Char.Identify, true);
  infoSvc.setCharacteristic(Char.Manufacturer, 'MiguelRipoll23');
  infoSvc.setCharacteristic(Char.Model, 'DIY');
  infoSvc.setCharacteristic(Char.SerialNumber, options.serialNumber);

  return {
    mainService: mainSvc,
    accessoryInfoService: infoSvc,
  };
}

/** Builds the list of services to expose to HomeKit. */
export function buildServiceList(svcs: ServiceRegistry): Service[] {
  return [svcs.mainService, svcs.accessoryInfoService];
}