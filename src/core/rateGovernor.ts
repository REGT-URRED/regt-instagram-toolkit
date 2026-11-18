import { setTimeout as sleep } from 'node:timers/promises';

export interface RateGovernorOptions {
  initialDelayMs: number;
  minDelayMs: number;
  maxDelayMs: number;
}

export interface RateGovernorSnapshot {
  delayMs: number;
  successes: number;
  bans: number;
}

/**
 * AIMD delay controller: backs off multiplicatively on ban signals and recovers
 * slowly on success, with jitter so the request pattern is not periodic.
 */
export class RateGovernor {
  private delayMs: number;
  private successes = 0;
  private bans = 0;

  public constructor(private readonly options: RateGovernorOptions) {
    this.delayMs = options.initialDelayMs;
  }

  public async wait(): Promise<void> {
    const jitter = this.delayMs * 0.25;
    const duration = Math.max(0, Math.round(this.delayMs + (Math.random() * 2 - 1) * jitter));
    await sleep(duration);
  }

  public recordSuccess(): void {
    this.successes += 1;
    this.delayMs = Math.max(this.options.minDelayMs, this.delayMs * 0.96);
  }

  public recordBan(): void {
    this.bans += 1;
    this.delayMs = Math.min(this.options.maxDelayMs, this.delayMs * 2 + Math.random() * 400);
  }

  public snapshot(): RateGovernorSnapshot {
    return {
      delayMs: Math.round(this.delayMs),
      successes: this.successes,
      bans: this.bans,
    };
  }
}
