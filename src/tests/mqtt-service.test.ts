import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventType } from '../types/event-type.js';
import { OriginType } from '../types/origin-type.js';
import { SecurityState } from '../types/security-state-type.js';
import { EventBusService } from '../services/event-bus-service.js';
import type { SystemState } from '../interfaces/system-state-interface.js';
import type { SecuritySystemOptions } from '../interfaces/options-interface.js';
import { MqttService } from '../services/mqtt-service.js';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockClient = {
  on: vi.fn().mockReturnThis(),
  publish: vi.fn(),
  connected: true,
  end: vi.fn(),
};

vi.mock('mqtt', () => ({
  connect: vi.fn(() => mockClient),
}));

import { connect } from 'mqtt';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeLog() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
}

function makeState(overrides: Partial<SystemState> = {}): SystemState {
  return {
    currentState: SecurityState.OFF,
    targetState: SecurityState.OFF,
    defaultState: SecurityState.OFF,
    availableTargetStates: [SecurityState.HOME, SecurityState.AWAY, SecurityState.NIGHT, SecurityState.OFF],
    isArming: false,
    isTripping: false,
    isKnocked: false,
    serverAuthenticationAttempts: 0,
    pausedCurrentState: null,
    audioProcess: null,
    ...overrides,
  };
}

function makeOptions(overrides: Partial<SecuritySystemOptions> = {}): SecuritySystemOptions {
  return {
    mqttBroker: null,
    mqttUsername: null,
    mqttPassword: null,
    mqttTopic: 'security-system/state',
    mqttClientId: null,
    proxyMode: false,
    ...overrides,
  } as unknown as SecuritySystemOptions;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('MqttService', () => {
  let log: ReturnType<typeof makeLog>;
  let state: SystemState;
  let bus: EventBusService;

  beforeEach(() => {
    log = makeLog();
    state = makeState();
    bus = new EventBusService();
    vi.clearAllMocks();
    mockClient.connected = true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does nothing when broker is not configured', () => {
    const service = new MqttService(log as never, makeOptions({ mqttBroker: null }), state);
    service.attachToBus(bus);

    expect(connect).not.toHaveBeenCalled();
    expect(log.debug).toHaveBeenCalledWith('MQTT broker not configured.');
  });

  it('connects when broker is configured', () => {
    const service = new MqttService(log as never, makeOptions({ mqttBroker: 'mqtt://localhost:1883' }), state);
    service.attachToBus(bus);

    expect(connect).toHaveBeenCalledWith('mqtt://localhost:1883', {});
    expect(mockClient.on).toHaveBeenCalledWith('connect', expect.any(Function));
    expect(mockClient.on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(mockClient.on).toHaveBeenCalledWith('close', expect.any(Function));
  });

  it('passes connection options when provided', () => {
    const options = makeOptions({
      mqttBroker: 'mqtt://broker:1883',
      mqttUsername: 'user',
      mqttPassword: 'pass',
      mqttClientId: 'my-client',
    });

    new MqttService(log as never, options, state).attachToBus(bus);

    expect(connect).toHaveBeenCalledWith('mqtt://broker:1883', {
      clientId: 'my-client',
      username: 'user',
      password: 'pass',
    });
  });

  it('publishes status on TARGET_CHANGED event', () => {
    state.isArming = true;
    state.currentState = SecurityState.HOME;
    state.targetState = SecurityState.AWAY;

    const service = new MqttService(log as never, makeOptions({ mqttBroker: 'mqtt://localhost' }), state);
    service.attachToBus(bus);

    bus.emit(EventType.TARGET_CHANGED, { state: SecurityState.AWAY, origin: OriginType.INTERNAL });

    expect(mockClient.publish).toHaveBeenCalledWith(
      'security-system/state',
      JSON.stringify({
        arming: true,
        current_mode: 'home',
        target_mode: 'away',
        tripped: false,
      }),
      { qos: 0, retain: true },
      expect.any(Function),
    );
  });

  it('publishes status on CURRENT_CHANGED event', () => {
    state.currentState = SecurityState.TRIGGERED;
    state.isTripping = true;

    const service = new MqttService(log as never, makeOptions({ mqttBroker: 'mqtt://localhost' }), state);
    service.attachToBus(bus);

    bus.emit(EventType.CURRENT_CHANGED, { state: SecurityState.TRIGGERED, origin: OriginType.INTERNAL });

    expect(mockClient.publish).toHaveBeenCalledTimes(1);
  });

  it('publishes status on ARMING event', () => {
    const service = new MqttService(log as never, makeOptions({ mqttBroker: 'mqtt://localhost' }), state);
    service.attachToBus(bus);

    bus.emit(EventType.ARMING, { state: SecurityState.HOME });

    expect(mockClient.publish).toHaveBeenCalledTimes(1);
  });

  it('publishes status on WARNING event', () => {
    const service = new MqttService(log as never, makeOptions({ mqttBroker: 'mqtt://localhost' }), state);
    service.attachToBus(bus);

    bus.emit(EventType.WARNING, { origin: OriginType.INTERNAL, triggerSeconds: 30 });

    expect(mockClient.publish).toHaveBeenCalledTimes(1);
  });

  it('bypasses publish when proxyMode is on and origin is EXTERNAL', () => {
    const service = new MqttService(log as never, makeOptions({ mqttBroker: 'mqtt://localhost', proxyMode: true }), state);
    service.attachToBus(bus);

    bus.emit(EventType.TARGET_CHANGED, { state: SecurityState.HOME, origin: OriginType.EXTERNAL });

    expect(mockClient.publish).not.toHaveBeenCalled();
    expect(log.debug).toHaveBeenCalledWith('MQTT publish bypassed (proxy mode).');
  });

  it('does not bypass publish when proxyMode is on but origin is INTERNAL', () => {
    const service = new MqttService(log as never, makeOptions({ mqttBroker: 'mqtt://localhost', proxyMode: true }), state);
    service.attachToBus(bus);

    bus.emit(EventType.TARGET_CHANGED, { state: SecurityState.HOME, origin: OriginType.INTERNAL });

    expect(mockClient.publish).toHaveBeenCalledTimes(1);
  });

  it('does not publish when client is not connected', () => {
    mockClient.connected = false;

    const service = new MqttService(log as never, makeOptions({ mqttBroker: 'mqtt://localhost' }), state);
    service.attachToBus(bus);

    bus.emit(EventType.TARGET_CHANGED, { state: SecurityState.HOME, origin: OriginType.INTERNAL });

    expect(mockClient.publish).not.toHaveBeenCalled();
  });

  it('disconnect ends the client', () => {
    const service = new MqttService(log as never, makeOptions({ mqttBroker: 'mqtt://localhost' }), state);
    service.attachToBus(bus);
    service.disconnect();

    expect(mockClient.end).toHaveBeenCalledWith(true);
  });

  it('uses custom topic when configured', () => {
    const service = new MqttService(log as never, makeOptions({ mqttBroker: 'mqtt://localhost', mqttTopic: 'alarm/status' }), state);
    service.attachToBus(bus);

    bus.emit(EventType.CURRENT_CHANGED, { state: SecurityState.OFF, origin: OriginType.INTERNAL });

    expect(mockClient.publish).toHaveBeenCalledWith(
      'alarm/status',
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('logs error on publish failure', () => {
    const service = new MqttService(log as never, makeOptions({ mqttBroker: 'mqtt://localhost' }), state);
    service.attachToBus(bus);

    bus.emit(EventType.CURRENT_CHANGED, { state: SecurityState.OFF, origin: OriginType.INTERNAL });

    const publishCallback = mockClient.publish.mock.calls[0][3];
    publishCallback(new Error('connection lost'));

    expect(log.error).toHaveBeenCalledWith('MQTT publish failed (security-system/state)');
    expect(log.error).toHaveBeenCalledWith('Error: connection lost');
  });
});
