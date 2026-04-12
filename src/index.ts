import type { API } from 'homebridge';
import { SecuritySystem } from './security-system.js';

const PLUGIN_NAME = 'homebridge-securitysystem';
const ACCESSORY_NAME = 'security-system';

export default (api: API): void => {
  api.registerAccessory(PLUGIN_NAME, ACCESSORY_NAME, SecuritySystem);
};
