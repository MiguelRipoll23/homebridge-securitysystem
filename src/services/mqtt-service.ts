import { connect } from 'mqtt';
import type { MqttClient } from 'mqtt';
import type { Logging } from 'homebridge';
import { stateToMode } from '../utils/state-util.js';
import { OriginType } from '../types/origin-type.js';
import type { SecuritySystemOptions } from '../interfaces/options-interface.js';
import type { SystemState } from '../interfaces/system-state-interface.js';
import type { MqttStatusPayload } from '../interfaces/mqtt-status-payload-interface.js';
import type { EventBusService } from './event-bus-service.js';
import { EventType } from '../types/event-type.js';
import type { TargetChangedPayload, CurrentChangedPayload, WarningPayload } from '../types/event-type.js';

export class MqttService {
  private client: MqttClient | null = null;

  constructor(
    private readonly log: Logging,
    private readonly options: SecuritySystemOptions,
    private readonly state: SystemState,
  ) {}

  attachToBus(bus: EventBusService): void {
    if (!this.options.mqttBroker) {
      this.log.debug('MQTT broker not configured.');
      return;
    }

    this.connect();

    bus.on(EventType.TARGET_CHANGED, (payload: TargetChangedPayload) => {
      this.publishStatus(payload.origin);
    });
    bus.on(EventType.CURRENT_CHANGED, (payload: CurrentChangedPayload) => {
      this.publishStatus(payload.origin);
    });
    bus.on(EventType.ARMING, () => {
      this.publishStatus(OriginType.INTERNAL);
    });
    bus.on(EventType.WARNING, (payload: WarningPayload) => {
      this.publishStatus(payload.origin);
    });
  }

  disconnect(): void {
    if (this.client) {
      this.client.end(true);
      this.client = null;
    }
  }

  private connect(): void {
    const connectionOptions: Record<string, unknown> = {};

    if (this.options.mqttClientId) {
      connectionOptions.clientId = this.options.mqttClientId;
    }

    if (this.options.mqttUsername) {
      connectionOptions.username = this.options.mqttUsername;
    }

    if (this.options.mqttPassword) {
      connectionOptions.password = this.options.mqttPassword;
    }

    this.client = connect(this.options.mqttBroker!, connectionOptions);

    this.client.on('connect', () => {
      this.log.info(`MQTT (${this.sanitiseBrokerUrl()})`);
    });

    this.client.on('error', (error: Error) => {
      this.log.error('MQTT error.');
      this.log.error(String(error));
    });

    this.client.on('close', () => {
      this.log.debug('MQTT connection closed.');
    });
  }

  private publishStatus(origin: OriginType): void {
    if (!this.client?.connected) {
      return;
    }

    if (this.options.proxyMode && origin === OriginType.EXTERNAL) {
      this.log.debug('MQTT publish bypassed (proxy mode).');
      return;
    }

    const payload: MqttStatusPayload = {
      arming: this.state.isArming,
      current_mode: stateToMode(this.state.currentState),
      target_mode: stateToMode(this.state.targetState),
      tripped: this.state.isTripping,
    };

    this.client.publish(
      this.options.mqttTopic,
      JSON.stringify(payload),
      { qos: 0, retain: true },
      (error?: Error) => {
        if (error) {
          this.log.error(`MQTT publish failed (${this.options.mqttTopic})`);
          this.log.error(String(error));
        }
      },
    );
  }

  private sanitiseBrokerUrl(): string {
    try {
      const url = new URL(this.options.mqttBroker!);
      if (url.password) {
        url.password = '****';
      }
      return url.toString();
    } catch {
      return this.options.mqttBroker!;
    }
  }
}
