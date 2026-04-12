import { spawn } from 'child_process';
import type { Logging } from 'homebridge';
import { SecurityState } from '../types/security-state-type.js';
import { OriginType } from '../types/origin-type.js';
import { stateToMode } from '../utils/state-util.js';
import type { SecuritySystemOptions } from '../interfaces/options-interface.js';
import type { SystemState } from '../interfaces/system-state-interface.js';
import type { EventBusService } from './event-bus-service.js';
import { EventType } from '../types/event-type.js';

/** Spawns shell commands in response to state-machine events. */
export class CommandService {
  constructor(
    private readonly log: Logging,
    private readonly options: SecuritySystemOptions,
    private readonly state: SystemState,
  ) {}

  attachToBus(bus: EventBusService): void {
    bus.on(EventType.TARGET_CHANGED, ({ state, origin }) => {
      this.execute('target', state, origin);
    });
    bus.on(EventType.CURRENT_CHANGED, ({ state, origin }) => {
      this.execute('current', state, origin);
    });
    bus.on(EventType.WARNING, ({ origin }) => {
      this.execute('current', 'warning' as unknown as SecurityState, origin);
    });
  }

  execute(type: string, stateOrMode: SecurityState | string, origin: OriginType): void {
    if (this.options.proxyMode && origin === OriginType.EXTERNAL) {
      this.log.debug('Command bypassed (proxy mode).');
      return;
    }

    let command = this.resolveCommand(type, stateOrMode);
    if (!command) {
      this.log.debug(`Command for ${type}/${stateOrMode} not set.`);
      return;
    }

    const currentMode = stateToMode(this.state.currentState);
    command = command.replace('${currentMode}', currentMode);

    const proc = spawn(command, { shell: true });

    proc.stdout.on('data', (data: Buffer) => {
      this.log.info(`Command output: ${data.toString().trim()}`);
    });

    proc.stderr.on('data', (data: Buffer) => {
      this.log.error(`Command failed (${command})\n${data.toString().trim()}`);
    });
  }

  private resolveCommand(type: string, stateOrMode: SecurityState | string): string | null {
    const s = stateOrMode;
    const o = this.options;

    if (s === 'warning') {
      return o.commandCurrentWarning; 
    }

    switch (s as SecurityState) {
    case SecurityState.TRIGGERED: return o.commandCurrentTriggered;
    case SecurityState.HOME: return type === 'current' ? o.commandCurrentHome : o.commandTargetHome;
    case SecurityState.AWAY: return type === 'current' ? o.commandCurrentAway : o.commandTargetAway;
    case SecurityState.NIGHT: return type === 'current' ? o.commandCurrentNight : o.commandTargetNight;
    case SecurityState.OFF: return type === 'current' ? o.commandCurrentOff : o.commandTargetOff;
    default:
      this.log.error(`Unknown command state (${s})`);
      return null;
    }
  }
}
