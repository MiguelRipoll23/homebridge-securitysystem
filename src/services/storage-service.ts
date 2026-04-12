import path from 'path';
import storage from 'node-persist';
import type { Logging } from 'homebridge';
import { SecurityState } from '../types/security-state-type.js';
import type { SecuritySystemOptions } from '../interfaces/options-interface.js';
import type { SystemState } from '../interfaces/system-state-interface.js';
import type { PersistedState } from '../interfaces/persisted-state-interface.js';

/** Persists and restores security system state across Homebridge restarts. */
export class StorageService {
  private initialised = false;

  constructor(
    private readonly log: Logging,
    private readonly options: SecuritySystemOptions,
    private readonly storagePath: string,
  ) {}

  async init(): Promise<void> {
    const dir = path.join(this.storagePath, `homebridge-securitysystem-${this.options.serialNumber}`);

    try {
      await storage.init({ dir });
      this.initialised = true;
    } catch (err) {
      this.log.error('Unable to initialise storage.');
      this.log.error(String(err));
    }
  }

  async load(state: SystemState): Promise<void> {
    if (!this.initialised) {
      return; 
    }

    if (this.options.testMode) {
      await storage.clear();
      this.log.debug('Saved state cleared (test mode).');
      return;
    }

    try {
      const saved = await storage.getItem('state') as PersistedState | undefined;
      if (!saved) {
        return; 
      }

      this.log.info('Saved state (Found)');
      this.log.debug('State (Loaded)', String(JSON.stringify(saved)));

      const current: SecurityState = saved.currentState ?? state.defaultState;
      const target: SecurityState = saved.targetState ?? state.defaultState;

      state.currentState = current;
      state.targetState = current === SecurityState.TRIGGERED ? target : current;
    } catch (err) {
      this.log.error('Saved state (Error)');
      this.log.error(String(err));
    }
  }

  async save(state: SystemState): Promise<void> {
    if (!this.options.saveState || !this.initialised) {
      return; 
    }

    const data: PersistedState = {
      currentState: state.currentState,
      targetState: state.targetState,
    };

    try {
      await storage.setItem('state', data);
      this.log.debug('State (Saved)', String(JSON.stringify(data)));
    } catch (err) {
      this.log.error('Unable to save state.');
      this.log.error(String(err));
    }
  }
}
