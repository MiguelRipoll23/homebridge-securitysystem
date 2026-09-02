import type { API, DynamicPlatformPlugin, Logging, MatterAccessory, PlatformAccessory, PlatformConfig } from 'homebridge';
import { SecuritySystem } from './security-system.js';

const PLUGIN_NAME = 'homebridge-securitysystem';
const PLATFORM_NAME = 'security-system';

/**
 * Homebridge dynamic platform that exposes the security system as a
 * platform accessory. The accessory UUID is stable so the same HomeKit
 * accessory is restored across restarts via homebridge's accessory cache.
 * Optional switch/sensor accessories are additionally published over Matter
 * when Matter is enabled on the bridge.
 */
export class SecuritySystemPlatform implements DynamicPlatformPlugin {
  private readonly cachedAccessories = new Map<string, PlatformAccessory>();
  private readonly cachedMatterAccessories = new Map<string, MatterAccessory>();

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

  configureMatterAccessory(accessory: MatterAccessory): void {
    this.cachedMatterAccessories.set(accessory.UUID, accessory);
  }

  private setupAccessories(): void {
    const uuid = this.api.hap.uuid.generate(PLATFORM_NAME);

    const cached = this.cachedAccessories.get(uuid);
    let system: SecuritySystem;

    if (cached) {
      this.cachedAccessories.delete(uuid);
      this.log.info('Restoring cached accessory:', cached.displayName);
      system = new SecuritySystem(this.log, this.config, this.api, cached);
      this.api.updatePlatformAccessories([cached]);
    } else {
      const accessory = new this.api.platformAccessory(
        'Security System',
        uuid,
        this.api.hap.Categories.SECURITY_SYSTEM,
      );
      system = new SecuritySystem(this.log, this.config, this.api, accessory);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);

      // Remove any cached accessories that are no longer configured.
      for (const stale of this.cachedAccessories.values()) {
        this.log.info('Removing unconfigured accessory:', stale.displayName);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [stale]);
      }
    }

    // Publish the configured Matter accessories (no-op when Matter is disabled).
    system.setupMatterAccessories(this.cachedMatterAccessories).catch((error: unknown) => {
      this.log.error('Failed to register Matter accessories.');
      this.log.error(String(error));
    });
  }
}

