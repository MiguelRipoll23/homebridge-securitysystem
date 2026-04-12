import type { Logging } from 'homebridge';
import { SecurityState } from '../types/security-state-type.js';
import { OriginType } from '../types/origin-type.js';
import { stateToMode } from '../utils/state-util.js';
import type { SecuritySystemOptions } from '../interfaces/options-interface.js';
import type { SystemState } from '../interfaces/system-state-interface.js';
import type { EventBusService } from './event-bus-service.js';
import { EventType } from '../types/event-type.js';

/** Sends HTTP GET webhook requests in response to state-machine events. */
export class WebhookService {
  constructor(
    private readonly log: Logging,
    private readonly options: SecuritySystemOptions,
    private readonly state: SystemState,
  ) {}

  attachToBus(bus: EventBusService): void {
    bus.on(EventType.TARGET_CHANGED, ({ state, origin }) => {
      this.send('target', state, origin);
    });
    bus.on(EventType.CURRENT_CHANGED, ({ state, origin }) => {
      this.send('current', state, origin);
    });
    bus.on(EventType.WARNING, ({ origin }) => {
      this.send('current', 'warning' as unknown as SecurityState, origin);
    });
  }

  send(type: string, stateOrMode: SecurityState | string, origin: OriginType): void {
    if (!this.options.webhookUrl) {
      this.log.debug('Webhook base URL not set.');
      return;
    }

    if (this.options.proxyMode && origin === OriginType.EXTERNAL) {
      this.log.debug('Webhook bypassed (proxy mode).');
      return;
    }

    const urlPath = this.resolvePath(type, stateOrMode);
    if (!urlPath) {
      this.log.debug(`Webhook path for ${type}/${stateOrMode} not set.`);
      return;
    }

    const currentMode = stateToMode(this.state.currentState);
    const finalPath = urlPath.replace('${currentMode}', currentMode);
    const url = this.options.webhookUrl + finalPath;

    fetch(url)
      .then(res => {
        if (!res.ok) {
          throw new Error(`Status ${res.status}`); 
        }
        this.log.info('Webhook event (Sent)');
      })
      .catch(err => {
        this.log.error(`Webhook request failed (${finalPath})`);
        this.log.error(String(err));
      });
  }

  private resolvePath(type: string, stateOrMode: SecurityState | string): string | null {
    const s = stateOrMode;
    const o = this.options;

    if (s === 'warning') {
      return o.webhookCurrentWarning; 
    }

    switch (s as SecurityState) {
    case SecurityState.TRIGGERED: return o.webhookCurrentTriggered;
    case SecurityState.HOME: return type === 'current' ? o.webhookCurrentHome : o.webhookTargetHome;
    case SecurityState.AWAY: return type === 'current' ? o.webhookCurrentAway : o.webhookTargetAway;
    case SecurityState.NIGHT: return type === 'current' ? o.webhookCurrentNight : o.webhookTargetNight;
    case SecurityState.OFF: return type === 'current' ? o.webhookCurrentOff : o.webhookTargetOff;
    default:
      this.log.error(`Unknown webhook state (${s})`);
      return null;
    }
  }
}
