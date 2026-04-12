import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import type { Logging } from 'homebridge';
import { stateToMode } from '../utils/state-util.js';
import { SecurityState } from '../types/security-state-type.js';
import type { SecuritySystemOptions } from '../interfaces/options-interface.js';
import type { SystemState } from '../interfaces/system-state-interface.js';
import type { EventBusService } from './event-bus-service.js';
import { EventType } from '../types/event-type.js';

/** Manages ffplay audio playback for arming, warning and triggered sounds. */
export class AudioService {
  constructor(
    private readonly log: Logging,
    private readonly options: SecuritySystemOptions,
    private readonly state: SystemState,
    private readonly audioSwitchEnabled: () => boolean,
  ) {}

  /** Register event listeners on the bus so audio reacts to state changes. */
  attachToBus(bus: EventBusService): void {
    bus.on(EventType.CURRENT_CHANGED, ({ state }) => {
      this.play('current', state);
    });
    bus.on(EventType.ARMING, ({ state }) => {
      this.play('target', state);
    });
    bus.on(EventType.WARNING, () => {
      this.play('current', 'warning' as unknown as SecurityState);
    });
  }

  play(type: string, stateOrMode: SecurityState | string): void {
    if (!this.options.audio) {
      return; 
    }

    const mode = typeof stateOrMode === 'string' ? stateOrMode : stateToMode(stateOrMode);

    this.stop();

    if (mode === 'off' && type === 'target') {
      return; 
    }

    if (mode !== 'triggered' && !this.audioSwitchEnabled()) {
      return; 
    }

    const dir = this.resolveDirectory();
    const filename = `${type}-${mode}.mp3`;
    const filePath = path.join(dir, this.options.audioLanguage, filename);

    if (!fs.existsSync(filePath)) {
      this.log.debug(`Sound file not found (${filePath})`);
      return;
    }

    const args = ['-loglevel', 'error', '-nodisp', '-i', filePath];
    this.appendLoopArgs(args, mode, type);

    if (this.options.audioVolume !== null) {
      args.push('-volume', String(this.options.audioVolume));
    }

    const env = this.buildEnv();
    this.log.debug(`ffplay ${args.join(' ')}`);

    this.state.audioProcess = spawn('ffplay', args, { env });

    this.state.audioProcess.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        this.log.error('Unable to play sound — ffmpeg is not installed.');
      } else {
        this.log.error(`Unable to play sound.\n${err}`);
      }
    });

    this.state.audioProcess.on('close', () => {
      this.state.audioProcess = null;
    });
  }

  stop(): void {
    if (this.state.audioProcess) {
      this.state.audioProcess.kill();
      this.state.audioProcess = null;
    }
  }

  async setup(): Promise<void> {
    if (!this.options.audioPath) {
      return; 
    }

    const langDir = path.join(this.options.audioPath, this.options.audioLanguage);

    try {
      await fs.promises.access(langDir);
    } catch {
      await fs.promises.mkdir(langDir, { recursive: true });
      this.log.warn('Check the audio path directory for setup instructions.');
    }
  }

  private resolveDirectory(): string {
    if (this.options.audioPath) {
      return this.options.audioPath.replace(/\/$/, '');
    }
    return path.join(new URL('.', import.meta.url).pathname, '..', 'sounds');
  }

  private appendLoopArgs(args: string[], mode: string, type: string): void {
    const isTriggered = mode === 'triggered';
    const isArmingMode = (mode === 'home' || mode === 'away' || mode === 'night') && type === 'target';
    const isWarning = mode === 'warning';

    if (isTriggered || (isArmingMode && this.options.audioArmingLooped) || (isWarning && this.options.audioAlertLooped)) {
      args.push('-loop', '-1');
    } else {
      args.push('-autoexit');
    }
  }

  private buildEnv(): NodeJS.ProcessEnv {
    const extra: Record<string, string> = {};
    for (const { key, value } of this.options.audioExtraVariables) {
      extra[key] = value;
    }
    return { ...process.env, ...extra };
  }
}
