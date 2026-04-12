import type { Logging } from 'homebridge';

type TimerHandle = ReturnType<typeof setTimeout> | null;
type IntervalHandle = ReturnType<typeof setInterval> | null;

/**
 * Centralised owner of all timer and interval handles used by the security
 * system. Handlers call set/clear methods here rather than mutating the shared
 * SystemState directly, giving a single place where timer lifecycle is managed.
 */
export class TimerManager {
  private armTimer: TimerHandle = null;
  private pauseTimer: TimerHandle = null;
  private triggerTimer: TimerHandle = null;
  private doubleKnockTimer: TimerHandle = null;
  private resetTimer: TimerHandle = null;
  private trippedInterval: IntervalHandle = null;
  private triggeredInterval: IntervalHandle = null;

  constructor(private readonly log: Logging) {}

  // ── Arm timer ──────────────────────────────────────────────────────────────

  setArmTimer(ms: number, cb: () => void): void {
    this.clearArmTimer();
    this.armTimer = setTimeout(() => {
      this.armTimer = null;
      cb();
    }, ms);
  }

  clearArmTimer(): void {
    if (this.armTimer) {
      clearTimeout(this.armTimer);
      this.armTimer = null;
      this.log.debug('Arming timeout (Cleared)');
    }
  }

  // ── Trigger timer ──────────────────────────────────────────────────────────

  setTriggerTimer(ms: number, cb: () => void): void {
    this.clearTriggerTimer();
    this.triggerTimer = setTimeout(() => {
      this.triggerTimer = null;
      cb();
    }, ms);
  }

  clearTriggerTimer(): void {
    if (this.triggerTimer) {
      clearTimeout(this.triggerTimer);
      this.triggerTimer = null;
      this.log.debug('Trigger timeout (Cleared)');
    }
  }

  isTriggerRunning(): boolean {
    return this.triggerTimer !== null;
  }

  // ── Pause timer ────────────────────────────────────────────────────────────

  setPauseTimer(ms: number, cb: () => void): void {
    this.clearPauseTimer();
    this.pauseTimer = setTimeout(() => {
      this.pauseTimer = null;
      cb();
    }, ms);
  }

  clearPauseTimer(): void {
    if (this.pauseTimer) {
      clearTimeout(this.pauseTimer);
      this.pauseTimer = null;
      this.log.debug('Pause timeout (Cleared)');
    }
  }

  // ── Double-knock timer ─────────────────────────────────────────────────────

  setDoubleKnockTimer(ms: number, cb: () => void): void {
    this.clearDoubleKnockTimer();
    this.doubleKnockTimer = setTimeout(() => {
      this.doubleKnockTimer = null;
      cb();
    }, ms);
  }

  clearDoubleKnockTimer(): void {
    if (this.doubleKnockTimer) {
      clearTimeout(this.doubleKnockTimer);
      this.doubleKnockTimer = null;
      this.log.debug('Double-knock timeout (Cleared)');
    }
  }

  // ── Reset timer ────────────────────────────────────────────────────────────

  setResetTimer(ms: number, cb: () => void): void {
    this.clearResetTimer();
    this.resetTimer = setTimeout(() => {
      this.resetTimer = null;
      cb();
    }, ms);
  }

  clearResetTimer(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
      this.log.debug('Reset timeout (Cleared)');
    }
  }

  // ── Tripped motion sensor interval ─────────────────────────────────────────

  setTrippedInterval(ms: number, cb: () => void): void {
    this.clearTrippedInterval();
    this.trippedInterval = setInterval(cb, ms);
  }

  clearTrippedInterval(): void {
    if (this.trippedInterval) {
      clearInterval(this.trippedInterval);
      this.trippedInterval = null;
      this.log.debug('Tripped interval (Cleared)');
    }
  }

  // ── Triggered motion sensor interval ─���─────────────────────────────────────

  setTriggeredInterval(ms: number, cb: () => void): void {
    this.clearTriggeredInterval();
    this.triggeredInterval = setInterval(cb, ms);
  }

  clearTriggeredInterval(): void {
    if (this.triggeredInterval) {
      clearInterval(this.triggeredInterval);
      this.triggeredInterval = null;
      this.log.debug('Triggered interval (Cleared)');
    }
  }

  // ── Bulk clear ─────────────────────────────────────────────────────────────

  /** Clears every active timer and interval. */
  clearAll(): void {
    this.clearTriggerTimer();
    this.clearArmTimer();
    this.clearTriggeredInterval();
    this.clearTrippedInterval();
    this.clearDoubleKnockTimer();
    this.clearPauseTimer();
    this.clearResetTimer();
  }
}
