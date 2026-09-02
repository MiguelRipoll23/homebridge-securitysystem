import { describe, expect, it, vi } from 'vitest';
import type { API, Logging, PlatformAccessory } from 'homebridge';
import { SecuritySystem } from '../security-system.js';

const HAP_UUID_BASE = '-0000-1000-8000-0026BB765291';

function hapUuid(suffix: string): string {
  return `000000${suffix}${HAP_UUID_BASE}`;
}

const SECURITY_SYSTEM_SERVICE_UUID = hapUuid('7E');
const ACCESSORY_INFORMATION_SERVICE_UUID = hapUuid('3E');

// ── Homebridge mocks ─────────────────────────────────────────────────────────
//
// The fake service/accessory objects intentionally mirror hap-nodejs semantics:
// addService() throws on a duplicate UUID without subtype, and getService()
// matches display names/names/subtypes for string arguments — never UUIDs.

type CharacteristicSpec = { UUID: string };

class FakeCharacteristic {
  value: unknown;

  setProps(): this {
    return this;
  }

  onGet(): this {
    return this;
  }

  onSet(): this {
    return this;
  }

  on(): this {
    return this;
  }

  updateCharacteristic(): this {
    return this;
  }
}

class FakeService {
  readonly UUID: string;
  displayName: string;
  name: string;
  subtype: string | undefined;
  private readonly characteristicByUuid = new Map<string, FakeCharacteristic>();

  constructor(uuid: string, displayName = '') {
    this.UUID = uuid;
    this.displayName = displayName;
    this.name = displayName;
  }

  addCharacteristic(spec: CharacteristicSpec): this {
    this.characteristic(spec);
    return this;
  }

  getCharacteristic(spec: CharacteristicSpec): FakeCharacteristic {
    return this.characteristic(spec);
  }

  setCharacteristic(spec: CharacteristicSpec, value: unknown): this {
    this.characteristic(spec).value = value;
    return this;
  }

  updateCharacteristic(spec: CharacteristicSpec, value: unknown): void {
    this.characteristic(spec).value = value;
  }

  removeAllListeners(): void {
    // no-op, mirrors the cleanup performed on removal
  }

  private characteristic(spec: CharacteristicSpec): FakeCharacteristic {
    let characteristic = this.characteristicByUuid.get(spec.UUID);
    if (!characteristic) {
      characteristic = new FakeCharacteristic();
      this.characteristicByUuid.set(spec.UUID, characteristic);
    }
    return characteristic;
  }
}

const Characteristic = {
  SecuritySystemCurrentState: { UUID: hapUuid('6F') },
  SecuritySystemTargetState: { UUID: hapUuid('70') },
  ConfiguredName: { UUID: hapUuid('E3') },
  Name: { UUID: hapUuid('23') },
  Identify: { UUID: hapUuid('14') },
  Manufacturer: { UUID: hapUuid('20') },
  Model: { UUID: hapUuid('21') },
  SerialNumber: { UUID: hapUuid('30') },
};

const Service = {
  SecuritySystem: class extends FakeService {
    constructor(displayName = '') {
      super(SECURITY_SYSTEM_SERVICE_UUID, displayName);
    }
  },
  AccessoryInformation: class extends FakeService {
    constructor() {
      super(ACCESSORY_INFORMATION_SERVICE_UUID);
    }
  },
};

function makeAccessory(initialServices: FakeService[] = []) {
  const services: FakeService[] = [...initialServices];
  return {
    services,
    updateDisplayName: vi.fn(),
    on: vi.fn(),
    addService: (service: FakeService) => {
      for (const existing of services) {
        if (existing.UUID !== service.UUID) {
          continue;
        }
        if (!service.subtype) {
          throw new Error(
            `Cannot add a Service with the same UUID '${existing.UUID}' as another Service in this Accessory without also defining a unique 'subtype' property.`,
          );
        }
        if (service.subtype === existing.subtype) {
          throw new Error(
            `Cannot add a Service with the same UUID '${existing.UUID}' and subtype '${existing.subtype}' as another Service in this Accessory.`,
          );
        }
      }
      services.push(service);
      return service;
    },
    removeService: (service: FakeService) => {
      const index = services.indexOf(service);
      if (index >= 0) {
        services.splice(index, 1);
      }
    },
    // Mirrors hap-nodejs: a string argument matches displayName/name/subtype,
    // so a full UUID string never finds a service here.
    getService: (name: string | CharacteristicSpec) => {
      for (const service of services) {
        if (typeof name === 'string') {
          if (service.displayName === name || service.name === name || service.subtype === name) {
            return service;
          }
        } else if (name.UUID === service.UUID) {
          return service;
        }
      }
      return undefined;
    },
  };
}

function makeApi(): API {
  return {
    hap: { Service, Characteristic },
    user: { storagePath: () => '/tmp/homebridge-securitysystem-test' },
    on: vi.fn(),
  } as unknown as API;
}

function makeLog(): Logging {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as Logging;
}

function makeConfig(): Record<string, unknown> {
  return {
    platform: 'security-system',
    name: 'Security System',
    serial_number: 'SEC-1',
    default_mode: 'Off',
    arm_seconds: 0,
    trigger_seconds: 0,
    reset_minutes: 10,
  };
}

function instantiate(accessory: ReturnType<typeof makeAccessory>): SecuritySystem {
  return new SecuritySystem(
    makeLog(),
    makeConfig(),
    makeApi(),
    accessory as unknown as PlatformAccessory,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SecuritySystem accessory population', () => {
  it('exposes exactly one security system service and one accessory information service', () => {
    const accessory = makeAccessory();

    instantiate(accessory);

    expect(accessory.services.filter(service => service.UUID === SECURITY_SYSTEM_SERVICE_UUID)).toHaveLength(1);
    expect(accessory.services.filter(service => service.UUID === ACCESSORY_INFORMATION_SERVICE_UUID)).toHaveLength(1);
    expect(accessory.services).toHaveLength(2);
  });

  it('replaces stale services on a restored cached accessory instead of throwing on duplicate UUIDs', () => {
    const staleSecuritySystemService = new Service.SecuritySystem('Security System');
    const staleAccessoryInformationService = new Service.AccessoryInformation();
    const accessory = makeAccessory([staleSecuritySystemService, staleAccessoryInformationService]);

    // Must not throw "Cannot add a Service with the same UUID".
    instantiate(accessory);

    const securitySystemServices = accessory.services
      .filter(service => service.UUID === SECURITY_SYSTEM_SERVICE_UUID);
    expect(securitySystemServices).toHaveLength(1);
    expect(securitySystemServices[0]).not.toBe(staleSecuritySystemService);

    const accessoryInformationServices = accessory.services
      .filter(service => service.UUID === ACCESSORY_INFORMATION_SERVICE_UUID);
    expect(accessoryInformationServices).toHaveLength(1);
    expect(accessoryInformationServices[0]).not.toBe(staleAccessoryInformationService);
  });

  it('keeps the fresh service instances when the cached accessory already holds several stale copies', () => {
    const accessory = makeAccessory([
      new Service.SecuritySystem('Security System'),
      new Service.AccessoryInformation(),
      new Service.SecuritySystem('Security System'),
    ]);

    instantiate(accessory);

    expect(accessory.services.filter(service => service.UUID === SECURITY_SYSTEM_SERVICE_UUID)).toHaveLength(1);
    expect(accessory.services.filter(service => service.UUID === ACCESSORY_INFORMATION_SERVICE_UUID)).toHaveLength(1);
  });
});
