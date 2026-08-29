import type { API } from 'homebridge';
import { SecuritySystemPlatform } from './security-system-platform.js';

const PLUGIN_NAME = 'homebridge-securitysystem';
const PLATFORM_NAME = 'security-system';

export default (api: API): void => {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, SecuritySystemPlatform);
};
