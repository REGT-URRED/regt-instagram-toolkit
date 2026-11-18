export type BanDecision = 'continue' | 'pause' | 'abort';

export interface BanGuardOptions {
  windowMs: number;
  pauseThreshold: number;
  abortThreshold: number;
  pauseMs: number;
  abortPauseMs: number;
}

/**
 * Counts ban/throttle signals in a sliding window and escalates:
 * normal -> pause (cooldown) -> abort the run instead of hammering the account.
 */
export class BanGuard {
  private readonly signals: number[] = [];

  public constructor(private readonly options: BanGuardOptions) {}

  public record(): BanDecision {
    const now = Date.now();
    this.signals.push(now);

    while (this.signals.length > 0 && now - this.signals[0]! > this.options.windowMs) {
      this.signals.shift();
    }

    if (this.signals.length >= this.options.abortThreshold) {
      return 'abort';
    }

    if (this.signals.length >= this.options.pauseThreshold) {
      return 'pause';
    }

    return 'continue';
  }

  public cooldownFor(decision: BanDecision): number {
    return decision === 'abort' ? this.options.abortPauseMs : this.options.pauseMs;
  }

  public get signalCount(): number {
    return this.signals.length;
  }
}
