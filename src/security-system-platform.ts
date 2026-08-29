import type { API, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig } from 'homebridge';
import { SecuritySystem } from './security-system.js';

const PLUGIN_NAME = 'homebridge-securitysystem';
const PLATFORM_NAME = 'security-system';

/**
 * Homebridge dynamic platform that exposes the security system as a
 * platform accessory. The accessory UUID is stable so the same HomeKit
 * accessory is restored across restarts via homebridge's accessory cache.
 */
export class SecuritySystemPlatform implements DynamicPlatformPlugin {
  private readonly cachedAccessories = new Map<string, PlatformAccessory>();

  constructor(
    private readonly log: Logging,
    private readonly config: PlatformConfig,
    private readonly api: API,
  ) {
    this.api.on('didFinishLaunching', () => this.setupAccessories());
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.cachedAccessories.set(accessory.UUID, accessory);
  }

  private setupAccessories(): void {
    const uuid = this.api.hap.uuid.generate(PLATFORM_NAME);

    const cached = this.cachedAccessories.get(uuid);
    if (cached) {
      this.cachedAccessories.delete(uuid);
      this.log.info('Restoring cached accessory:', cached.displayName);
      new SecuritySystem(this.log, this.config, this.api, cached);
      this.api.updatePlatformAccessories([cached]);
      return;
    }

    const accessory = new this.api.platformAccessory(
      'Security System',
      uuid,
      this.api.hap.Categories.SECURITY_SYSTEM,
    );
    new SecuritySystem(this.log, this.config, this.api, accessory);
    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);

    // Remove any cached accessories that are no longer configured.
    for (const stale of this.cachedAccessories.values()) {
      this.log.info('Removing unconfigured accessory:', stale.displayName);
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [stale]);
    }
  }
}
