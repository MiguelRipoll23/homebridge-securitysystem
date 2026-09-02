import type { CharacteristicValue } from 'homebridge';
import type { CharacteristicConstructor } from '../interfaces/hap-types-interface.js';
import type { ServiceRegistry } from '../interfaces/service-registry-interface.js';
import type { SystemState } from '../interfaces/system-state-interface.js';
import { SecurityState } from '../types/security-state-type.js';
import { OriginType } from '../types/origin-type.js';
import type { StateHandler } from '../handlers/state-handler.js';

/** Attaches the HomeKit characteristic handlers (onGet / onSet) to the security system service. */
export class HomeKitRegistrar {
  constructor(
    private readonly svcs: ServiceRegistry,
    private readonly state: SystemState,
    private readonly stateHandler: StateHandler,
  ) {}

  register(Char: CharacteristicConstructor): void {
    const s = this.svcs;

    s.mainService.getCharacteristic(Char.SecuritySystemCurrentState)
      .onGet(async (): Promise<CharacteristicValue> => this.state.currentState);
    s.mainService.getCharacteristic(Char.SecuritySystemTargetState)
      .onGet(async (): Promise<CharacteristicValue> => this.state.targetState)
      .onSet(async (v: CharacteristicValue) => {
        this.stateHandler.updateTargetState(v as SecurityState, OriginType.REGULAR_SWITCH, this.stateHandler.getArmingSeconds(v as SecurityState));
      });
  }
}