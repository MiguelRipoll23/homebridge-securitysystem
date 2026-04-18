import { describe, it, expect, vi } from 'vitest';
import { SecurityState } from '../types/security-state-type.js';
import { OriginType } from '../types/origin-type.js';
import type { ConditionContext } from '../interfaces/condition-context-interface.js';
import type { SystemState } from '../interfaces/system-state-interface.js';
import type { SecuritySystemOptions } from '../interfaces/options-interface.js';
import { NotArmedCondition } from '../conditions/not-armed-condition.js';
import { ArmingInProgressCondition } from '../conditions/arming-in-progress-condition.js';
import { AlreadyTriggeredCondition } from '../conditions/already-triggered-condition.js';
import { DoubleKnockCondition } from '../conditions/double-knock-condition.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeState(overrides: Partial<SystemState> = {}): SystemState {
  return {
    currentState: SecurityState.HOME,
    targetState: SecurityState.HOME,
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
    overrideOff: false,
    doubleKnock: false,
    doubleKnockSeconds: 90,
    doubleKnockModes: [],
    homeDoubleKnockSeconds: null,
    awayDoubleKnockSeconds: null,
    nightDoubleKnockSeconds: null,
    armingLockSwitch: false,
    armingLockSwitches: false,
    ...overrides,
  } as unknown as SecuritySystemOptions;
}

function makeLog() {
  return { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn(), success: vi.fn() };
}

function makeCtx(state: SystemState, options: SecuritySystemOptions, value: boolean, origin = OriginType.REGULAR_SWITCH): ConditionContext {
  return { state, services: {} as ConditionContext['services'], options, value, origin, log: makeLog() as unknown as ConditionContext['log'] };
}

// ── NotArmedCondition ─────────────────────────────────────────────────────────

describe('NotArmedCondition', () => {
  const cond = new NotArmedCondition();

  it('blocks when disarmed and override_off is false', () => {
    const state = makeState({ currentState: SecurityState.OFF });
    const opts = makeOptions({ overrideOff: false });
    expect(cond.evaluate(makeCtx(state, opts, true))).toBe(true);
  });

  it('allows when disarmed but override_off is true', () => {
    const state = makeState({ currentState: SecurityState.OFF });
    const opts = makeOptions({ overrideOff: true });
    expect(cond.evaluate(makeCtx(state, opts, true))).toBe(false);
  });

  it('allows when disarmed but origin is OVERRIDE_SWITCH', () => {
    const state = makeState({ currentState: SecurityState.OFF });
    const opts = makeOptions({ overrideOff: false });
    expect(cond.evaluate(makeCtx(state, opts, true, OriginType.OVERRIDE_SWITCH))).toBe(false);
  });

  it('allows when system is armed', () => {
    const state = makeState({ currentState: SecurityState.HOME });
    const opts = makeOptions({ overrideOff: false });
    expect(cond.evaluate(makeCtx(state, opts, true))).toBe(false);
  });

  it('does not block on value=false', () => {
    const state = makeState({ currentState: SecurityState.OFF });
    const opts = makeOptions({ overrideOff: false });
    expect(cond.evaluate(makeCtx(state, opts, false))).toBe(false);
  });
});

// ── ArmingInProgressCondition ─────────────────────────────────────────────────

describe('ArmingInProgressCondition', () => {
  const cond = new ArmingInProgressCondition();

  it('blocks when isArming is true and value is true', () => {
    const state = makeState({ isArming: true });
    expect(cond.evaluate(makeCtx(state, makeOptions(), true))).toBe(true);
  });

  it('allows when not arming', () => {
    const state = makeState({ isArming: false });
    expect(cond.evaluate(makeCtx(state, makeOptions(), true))).toBe(false);
  });

  it('does not block on value=false', () => {
    const state = makeState({ isArming: true });
    expect(cond.evaluate(makeCtx(state, makeOptions(), false))).toBe(false);
  });
});

// ── AlreadyTriggeredCondition ─────────────────────────────────────────────────

describe('AlreadyTriggeredCondition', () => {
  const cond = new AlreadyTriggeredCondition();

  it('blocks when currently triggered and value is true', () => {
    const state = makeState({ currentState: SecurityState.TRIGGERED });
    expect(cond.evaluate(makeCtx(state, makeOptions(), true))).toBe(true);
  });

  it('allows when not triggered', () => {
    const state = makeState({ currentState: SecurityState.HOME });
    expect(cond.evaluate(makeCtx(state, makeOptions(), true))).toBe(false);
  });

  it('does not block on value=false (cancel)', () => {
    const state = makeState({ currentState: SecurityState.TRIGGERED });
    expect(cond.evaluate(makeCtx(state, makeOptions(), false))).toBe(false);
  });
});

// ── DoubleKnockCondition ──────────────────────────────────────────────────────

describe('DoubleKnockCondition', () => {
  it('allows through when doubleKnock option is disabled', () => {
    const onFirstKnock = vi.fn();
    const cond = new DoubleKnockCondition(onFirstKnock, vi.fn());
    const state = makeState({ isKnocked: false });
    const opts = makeOptions({ doubleKnock: false, doubleKnockModes: ['home'] });
    expect(cond.evaluate(makeCtx(state, opts, true))).toBe(false);
    expect(onFirstKnock).not.toHaveBeenCalled();
  });

  it('allows override switch to bypass double-knock', () => {
    const onFirstKnock = vi.fn();
    const cond = new DoubleKnockCondition(onFirstKnock, vi.fn());
    const state = makeState({ isKnocked: false, currentState: SecurityState.HOME });
    const opts = makeOptions({ doubleKnock: true, doubleKnockModes: ['home'], doubleKnockSeconds: 90 });
    expect(cond.evaluate(makeCtx(state, opts, true, OriginType.OVERRIDE_SWITCH))).toBe(false);
    expect(onFirstKnock).not.toHaveBeenCalled();
  });

  it('blocks first knock and calls onFirstKnock', () => {
    const onFirstKnock = vi.fn();
    const cond = new DoubleKnockCondition(onFirstKnock, vi.fn());
    const state = makeState({ isKnocked: false, currentState: SecurityState.HOME });
    const opts = makeOptions({ doubleKnock: true, doubleKnockModes: ['home'], doubleKnockSeconds: 90 });
    expect(cond.evaluate(makeCtx(state, opts, true))).toBe(true);
    expect(state.isKnocked).toBe(true);
    expect(onFirstKnock).toHaveBeenCalledWith(90, expect.any(Function));
  });

  it('allows second knock through and clears isKnocked', () => {
    const cond = new DoubleKnockCondition(vi.fn(), vi.fn());
    const state = makeState({ isKnocked: true, currentState: SecurityState.HOME });
    const opts = makeOptions({ doubleKnock: true, doubleKnockModes: ['home'], doubleKnockSeconds: 90 });
    expect(cond.evaluate(makeCtx(state, opts, true))).toBe(false);
    expect(state.isKnocked).toBe(false);
  });

  it('uses mode-specific knock window when configured', () => {
    const onFirstKnock = vi.fn();
    const cond = new DoubleKnockCondition(onFirstKnock, vi.fn());
    const state = makeState({ isKnocked: false, currentState: SecurityState.AWAY });
    const opts = makeOptions({ doubleKnock: true, doubleKnockModes: ['away'], doubleKnockSeconds: 90, awayDoubleKnockSeconds: 30 });
    cond.evaluate(makeCtx(state, opts, true));
    expect(onFirstKnock).toHaveBeenCalledWith(30, expect.any(Function));
  });
});
