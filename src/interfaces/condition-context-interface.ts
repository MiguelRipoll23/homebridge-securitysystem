import type { OriginType } from '../types/origin-type.js';
import type { SecuritySystemOptions } from './options-interface.js';
import type { ServiceRegistry } from './service-registry-interface.js';
import type { SystemState } from './system-state-interface.js';

/** Context passed to Condition.evaluate() to determine if an action is blocked. */
export interface ConditionContext {
  state: SystemState;
  services: ServiceRegistry;
  options: SecuritySystemOptions;
  /** The value being set (true = activating, false = deactivating). */
  value: boolean;
  origin: OriginType;
}
