import { describe, it, expect, vi } from 'vitest';
import { SecurityState } from '../types/security-state-type.js';
import { OriginType } from '../types/origin-type.js';
import type { SystemState } from '../interfaces/system-state-interface.js';
import type { SecuritySystemOptions } from '../interfaces/options-interface.js';
import { SwitchHandler } from '../handlers/switch-handler.js';

// ── Minimal mocks ─────────────────────────────────────────────────────────────

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
    armingLocks: { global: false, home: false, away: false, night: false },
    modeAwayExtended: false,
    ...overrides,
  };
}

function makeOptions(overrides: Partial<SecuritySystemOptions> = {}): SecuritySystemOptions {
  return {
    armSeconds: 0,
    triggerSeconds: 0,
    resetMinutes: 10,
    testMode: false,
    proxyMode: false,
    saveState: false,
    overrideOff: false,
    doubleKnock: false,
    doubleKnockSeconds: 90,
    doubleKnockModes: [],
    homeTriggerSeconds: null,
    awayTriggerSeconds: null,
    nightTriggerSeconds: null,
    homeDoubleKnockSeconds: null,
    awayDoubleKnockSeconds: null,
    nightDoubleKnockSeconds: null,
    modeAwayExtendedSwitchTriggerSeconds: null,
    armingLockSwitch: false,
    armingLockSwitches: false,
    disabledModes: [],
    homeArmSeconds: null,
    awayArmSeconds: null,
    nightArmSeconds: null,
    trippedMotionSensor: false,
    trippedMotionSensorSeconds: 5,
    resetOffFlow: false,
    ...overrides,
  } as unknown as SecuritySystemOptions;
}

function makeMockLog() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
}

function makeMockStateHandler() {
  return {
    updateTargetState: vi.fn().mockReturnValue({ success: true }),
    getArmingSeconds: vi.fn().mockReturnValue(0),
  };
}

function makeMockTimers() {
  return {
    setArmTimer: vi.fn(), clearArmTimer: vi.fn(),
    setTriggerTimer: vi.fn(), clearTriggerTimer: vi.fn(), isTriggerRunning: vi.fn().mockReturnValue(false),
    setPauseTimer: vi.fn(), clearPauseTimer: vi.fn(),
    setDoubleKnockTimer: vi.fn(), clearDoubleKnockTimer: vi.fn(),
    setResetTimer: vi.fn(), clearResetTimer: vi.fn(),
    setTrippedInterval: vi.fn(), clearTrippedInterval: vi.fn(),
    clearAll: vi.fn(),
  } as any;
}

function makeHandler(state: SystemState, options = makeOptions()) {
  const stateHandler = makeMockStateHandler();
  const log = makeMockLog();
  const timers = makeMockTimers();
  const handler = new SwitchHandler(state, options, log as any, timers, stateHandler as any);
  return { handler, stateHandler, log, timers };
}

// ── SwitchHandler tests ───────────────────────────────────────────────────────

describe('SwitchHandler', () => {
  it('setModeSwitch arms via updateTargetState with the arming delay', () => {
    const state = makeState();
    const { handler, stateHandler } = makeHandler(state);
    stateHandler.getArmingSeconds.mockReturnValue(42);

    const result = handler.setModeSwitch(SecurityState.HOME, true);

    expect(stateHandler.updateTargetState).toHaveBeenCalledWith(SecurityState.HOME, OriginType.INTERNAL, 42);
    expect(result.success).toBe(true);
  });

  it('setModeSwitch reports how updateTargetState refused the change', () => {
    const state = makeState();
    const { handler, stateHandler } = makeHandler(state);
    stateHandler.updateTargetState.mockReturnValue({ success: false, reason: 'arming is blocked by an arming lock switch' });

    const result = handler.setModeSwitch(SecurityState.HOME, true);

    expect(result.success).toBe(false);
    expect(result.reason).toBe('arming is blocked by an arming lock switch');
  });

  it('setModeSwitch rejects turning a mode switch off', () => {
    const state = makeState();
    const { handler, stateHandler } = makeHandler(state);

    const result = handler.setModeSwitch(SecurityState.HOME, false);

    expect(result.success).toBe(false);
    expect(stateHandler.updateTargetState).not.toHaveBeenCalled();
  });

  it('setModeOffSwitch disarms and propagates refusals', () => {
    const state = makeState();
    const { handler, stateHandler } = makeHandler(state);

    handler.setModeOffSwitch(true);
    expect(stateHandler.updateTargetState).toHaveBeenCalledWith(SecurityState.OFF, OriginType.INTERNAL, 0);

    stateHandler.updateTargetState.mockReturnValue({ success: false, reason: 'target mode is disabled' });
    const refused = handler.setModeOffSwitch(true);
    expect(refused).toEqual({ success: false, reason: 'target mode is disabled' });

    const rejected = handler.setModeOffSwitch(false);
    expect(rejected.success).toBe(false);
    // Only the two successful ON commands reach updateTargetState.
    expect(stateHandler.updateTargetState).toHaveBeenCalledTimes(2);
  });

  it('setModeAwayExtendedSwitch arms away and records the extended flag', () => {
    const state = makeState();
    const { handler, stateHandler } = makeHandler(state);

    const result = handler.setModeAwayExtendedSwitch(true);

    expect(stateHandler.updateTargetState).toHaveBeenCalledWith(SecurityState.AWAY, OriginType.INTERNAL, 0);
    expect(state.modeAwayExtended).toBe(true);
    expect(result.success).toBe(true);
  });

  it('setModeAwayExtendedSwitch does not set the extended flag when arming was refused', () => {
    const state = makeState();
    const { handler, stateHandler } = makeHandler(state);
    stateHandler.updateTargetState.mockReturnValue({ success: false, reason: 'arming is blocked by an arming lock switch' });

    const result = handler.setModeAwayExtendedSwitch(true);

    expect(result.success).toBe(false);
    expect(state.modeAwayExtended).toBe(false);
  });

  it('setModeAwayExtendedSwitch rejects turning off', () => {
    const state = makeState();
    const { handler } = makeHandler(state);

    expect(handler.setModeAwayExtendedSwitch(false).success).toBe(false);
  });

  it('setModePauseSwitch rejects while triggered', () => {
    const state = makeState({ currentState: SecurityState.TRIGGERED });
    const { handler, timers } = makeHandler(state);

    const result = handler.setModePauseSwitch(true);

    expect(result.success).toBe(false);
    expect(timers.setPauseTimer).not.toHaveBeenCalled();
  });

  it('setModePauseSwitch rejects while disarmed', () => {
    const state = makeState({ currentState: SecurityState.OFF });
    const { handler, timers } = makeHandler(state);

    const result = handler.setModePauseSwitch(true);

    expect(result.success).toBe(false);
    expect(timers.setPauseTimer).not.toHaveBeenCalled();
  });

  it('setModePauseSwitch pauses and schedules the resume timer', () => {
    const state = makeState({ currentState: SecurityState.HOME });
    const { handler, stateHandler, timers } = makeHandler(state, makeOptions({ pauseMinutes: 5 }));

    const result = handler.setModePauseSwitch(true);

    expect(state.pausedCurrentState).toBe(SecurityState.HOME);
    expect(stateHandler.updateTargetState).toHaveBeenCalledWith(SecurityState.OFF, OriginType.INTERNAL, 0);
    expect(timers.setPauseTimer).toHaveBeenCalledWith(5 * 60 * 1000, expect.any(Function));
    expect(result.success).toBe(true);
  });

  it('setModePauseSwitch cancel resumes the paused mode', () => {
    const state = makeState({ currentState: SecurityState.OFF, pausedCurrentState: SecurityState.AWAY });
    const { handler, stateHandler, timers } = makeHandler(state);

    const result = handler.setModePauseSwitch(false);

    expect(timers.clearPauseTimer).toHaveBeenCalled();
    expect(stateHandler.updateTargetState).toHaveBeenCalledWith(SecurityState.AWAY, OriginType.INTERNAL, 0);
    expect(result.success).toBe(true);
  });

  it('updateArmingLock stores the lock on state and returns success', () => {
    const state = makeState();
    const { handler } = makeHandler(state);

    expect(handler.updateArmingLock('global', true).success).toBe(true);
    expect(state.armingLocks.global).toBe(true);

    expect(handler.updateArmingLock('away', false).success).toBe(true);
    expect(state.armingLocks.away).toBe(false);
  });

  it('updateArmingLock rejects unknown modes', () => {
    const state = makeState();
    const { handler } = makeHandler(state);

    const result = handler.updateArmingLock('garage', true);

    expect(result.success).toBe(false);
    expect(result.reason).toBe('unknown arming lock mode: garage');
  });
});