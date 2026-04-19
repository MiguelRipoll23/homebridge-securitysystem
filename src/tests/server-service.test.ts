import { describe, it, expect, vi, afterEach } from 'vitest';
import { SecurityState } from '../types/security-state-type.js';
import { OriginType } from '../types/origin-type.js';
import type { SystemState } from '../interfaces/system-state-interface.js';
import type { SecuritySystemOptions } from '../interfaces/options-interface.js';
import type { ServiceResult } from '../types/service-result-type.js';

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
    serverPort: 8080,
    serverApiKey: null,
    ...overrides,
  } as unknown as SecuritySystemOptions;
}

function makeStateHandler(result: ServiceResult = { success: true }) {
  return {
    updateTargetState: vi.fn().mockReturnValue(result),
    isTripping: vi.fn().mockReturnValue(false),
    setCurrentState: vi.fn(),
  };
}

function makeTripHandler(result: ServiceResult = { success: true }) {
  return {
    updateTripSwitch: vi.fn().mockReturnValue(result),
    triggerIfModeSet: vi.fn().mockReturnValue(result),
    checkTripConditions: vi.fn().mockReturnValue(result),
  };
}

function makeSwitchHandler(result: ServiceResult = { success: true }) {
  return {
    updateArmingLock: vi.fn().mockReturnValue(result),
  };
}

async function makeService(
  stateHandlerResult?: ServiceResult,
  tripHandlerResult?: ServiceResult,
  switchHandlerResult?: ServiceResult,
  stateOverrides?: Partial<SystemState>,
  optionsOverrides?: Partial<SecuritySystemOptions>,
) {
  const { ServerService } = await import('../services/server-service.js');
  const log = makeLog();
  const state = makeState(stateOverrides);
  const options = makeOptions(optionsOverrides);
  const stateHandler = makeStateHandler(stateHandlerResult);
  const tripHandler = makeTripHandler(tripHandlerResult);
  const switchHandler = makeSwitchHandler(switchHandlerResult);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new ServerService(log as any, options, state, stateHandler as any, tripHandler as any, switchHandler as any);

  return { service, stateHandler, tripHandler, switchHandler, state };
}

function json(body: unknown, path: string, method = 'PUT') {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ── PUT /mode/update ──────────────────────────────────────────────────────────

describe('PUT /mode/update', () => {
  it('returns 204 and calls updateTargetState with no delay', async () => {
    const { service, stateHandler } = await makeService();
    const res = await service.app.request(json({ mode: 'home' }, '/mode/update'));
    expect(res.status).toBe(204);
    expect(stateHandler.updateTargetState).toHaveBeenCalledWith(SecurityState.HOME, OriginType.EXTERNAL, 0);
  });

  it('returns 204 and passes delay to updateTargetState', async () => {
    const { service, stateHandler } = await makeService();
    const res = await service.app.request(json({ mode: 'away', delay: 10 }, '/mode/update'));
    expect(res.status).toBe(204);
    expect(stateHandler.updateTargetState).toHaveBeenCalledWith(SecurityState.AWAY, OriginType.EXTERNAL, 10);
  });

  it('returns 204 for off mode without delay', async () => {
    const { service, stateHandler } = await makeService();
    const res = await service.app.request(json({ mode: 'off' }, '/mode/update'));
    expect(res.status).toBe(204);
    expect(stateHandler.updateTargetState).toHaveBeenCalledWith(SecurityState.OFF, OriginType.EXTERNAL, 0);
  });

  it('returns 409 when stateHandler rejects the mode change', async () => {
    const { service } = await makeService({ success: false, reason: 'target mode is already set' });
    const res = await service.app.request(json({ mode: 'night' }, '/mode/update'));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.reason).toBe('target mode is already set');
  });

  it('rejects "triggered" — returns 400 (Zod validation failure)', async () => {
    const { service } = await makeService();
    const res = await service.app.request(json({ mode: 'triggered' }, '/mode/update'));
    expect(res.status).toBe(400);
  });
});

// ── POST /mode/trip ───────────────────────────────────────────────────────────

describe('POST /mode/trip', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns 204 and calls updateTripSwitch when mode and delay are omitted', async () => {
    const { service, tripHandler } = await makeService();
    const res = await service.app.request(json({}, '/mode/trip', 'POST'));
    expect(res.status).toBe(204);
    expect(tripHandler.updateTripSwitch).toHaveBeenCalledWith(true, OriginType.EXTERNAL, false);
    expect(tripHandler.triggerIfModeSet).not.toHaveBeenCalled();
  });

  it('returns 204 and calls updateTripSwitch when mode is null', async () => {
    const { service, tripHandler } = await makeService();
    const res = await service.app.request(json({ mode: null }, '/mode/trip', 'POST'));
    expect(res.status).toBe(204);
    expect(tripHandler.updateTripSwitch).toHaveBeenCalledWith(true, OriginType.EXTERNAL, false);
  });

  it('returns 204 and calls triggerIfModeSet when mode is specified', async () => {
    const { service, tripHandler } = await makeService();
    const res = await service.app.request(json({ mode: 'away' }, '/mode/trip', 'POST'));
    expect(res.status).toBe(204);
    expect(tripHandler.triggerIfModeSet).toHaveBeenCalledWith(SecurityState.AWAY, true);
    expect(tripHandler.updateTripSwitch).not.toHaveBeenCalled();
  });

  it('returns 409 when trip handler rejects without delay', async () => {
    const { service } = await makeService(undefined, { success: false, reason: 'not armed' });
    const res = await service.app.request(json({}, '/mode/trip', 'POST'));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.reason).toBe('not armed');
  });

  it('returns 409 when mode does not match (triggerIfModeSet rejects)', async () => {
    const { service } = await makeService(undefined, { success: false, reason: 'mode not set' });
    const res = await service.app.request(json({ mode: 'home' }, '/mode/trip', 'POST'));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.reason).toBe('mode not set');
  });

  it('returns 204 immediately and calls updateTripSwitch after delay when mode is omitted', async () => {
    vi.useFakeTimers();
    const { service, tripHandler } = await makeService();

    const res = await service.app.request(json({ delay: 5 }, '/mode/trip', 'POST'));
    expect(res.status).toBe(204);
    expect(tripHandler.checkTripConditions).toHaveBeenCalledWith(true, OriginType.EXTERNAL);
    expect(tripHandler.updateTripSwitch).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(5000);
    expect(tripHandler.updateTripSwitch).toHaveBeenCalledWith(true, OriginType.EXTERNAL, false);
  });

  it('returns 204 immediately and calls triggerIfModeSet after delay when mode is specified', async () => {
    vi.useFakeTimers();
    const { service, tripHandler } = await makeService();

    const res = await service.app.request(json({ mode: 'night', delay: 3 }, '/mode/trip', 'POST'));
    expect(res.status).toBe(204);
    expect(tripHandler.triggerIfModeSet).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(3000);
    expect(tripHandler.triggerIfModeSet).toHaveBeenCalledWith(SecurityState.NIGHT, true);
  });

  it('returns 409 on pre-check failure even when delay is specified', async () => {
    const { service, tripHandler } = await makeService(
      undefined,
      { success: false, reason: 'arming in progress' },
    );
    const res = await service.app.request(json({ delay: 10 }, '/mode/trip', 'POST'));
    expect(res.status).toBe(409);
    expect(tripHandler.updateTripSwitch).not.toHaveBeenCalled();
  });

  it('treats delay: null the same as no delay', async () => {
    const { service, tripHandler } = await makeService();
    const res = await service.app.request(json({ delay: null }, '/mode/trip', 'POST'));
    expect(res.status).toBe(204);
    expect(tripHandler.updateTripSwitch).toHaveBeenCalledWith(true, OriginType.EXTERNAL, false);
  });
});

// ── PUT /switches/arming-lock ─────────────────────────────────────────────────

describe('PUT /switches/arming-lock', () => {
  it('returns 204 and calls updateArmingLock', async () => {
    const { service, switchHandler } = await makeService();
    const res = await service.app.request(json({ mode: 'home', value: true }, '/switches/arming-lock'));
    expect(res.status).toBe(204);
    expect(switchHandler.updateArmingLock).toHaveBeenCalledWith('home', true);
  });

  it('returns 409 when switchHandler rejects', async () => {
    const { service } = await makeService(
      undefined,
      undefined,
      { success: false, reason: 'unknown arming lock mode: invalid' },
    );
    const res = await service.app.request(json({ mode: 'global', value: false }, '/switches/arming-lock'));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.reason).toBe('unknown arming lock mode: invalid');
  });
});
