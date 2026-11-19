import type { Page } from 'puppeteer-core';
import type { CleanupOptions, TargetConfiguration, TranslationDictionary } from '../../types.js';
import { controlTranslationKeys } from '../../translations/defaultTranslations.js';
import { getTranslationValues } from '../../translations/loadTranslations.js';
import { logger } from '../../utils/logger.js';
import { normalizeText } from '../../utils/text.js';
import type { ProgressPhase } from '../../utils/progress.js';
import type { CleanupToastResult, InstagramMutationResult, SelectionResult } from './types.js';

const throttleCooldownStepMs = 60_000;
const maxThrottleCooldownMs = 600_000;

export class CleanupContext {
  public totalProcessed = 0;
  public emptyPasses = 0;
  public currentSelection: SelectionResult = {
    count: 0,
    confirmedCount: null,
    attemptedCount: 0,
    signatures: [],
    countIsCumulative: false,
  };
  public lastToast: CleanupToastResult | null = null;
  public lastMutation: InstagramMutationResult | null = null;
  private throttleCooldownMs = 0;
  private consecutiveThrottleSignals = 0;
  // The first item of the likes grid is an unavailable black tile that makes
  // Instagram reject the whole batch, so it is never selected.
  private leadingItemsToSkip = 1;
  private leadingSkipArmed = true;
  private consecutiveSkippedKeys = 0;
  private pendingThrottleCooldownWaitMs = 0;

  public constructor(
    public readonly page: Page,
    public readonly target: TargetConfiguration,
    public readonly translations: TranslationDictionary,
    public readonly options: CleanupOptions,
  ) {}

  public get controlText(): string[] {
    return getTranslationValues(this.translations, controlTranslationKeys).map(normalizeText);
  }

  public pickBatchSize(): number {
    const { min, max } = this.options.batchSize;
    const goal = this.options.goal;
    const remaining = goal === undefined ? undefined : Math.max(0, goal - this.totalProcessed);

    if (remaining === 0) {
      return 1;
    }

    const minimum = remaining === undefined ? min : Math.max(1, Math.min(min, remaining));
    // Batches aim for roughly four passes to reach the goal. The result is
    // clamped to the configured ceiling (95 for likes, 60 for comments), so a
    // goal of 1000 still runs in batches of at most 95.
    const ceiling =
      remaining === undefined
        ? max
        : Math.max(minimum, Math.min(max, Math.ceil(remaining / 4)));
    const size = minimum + Math.floor(Math.random() * Math.max(1, ceiling - minimum + 1));

    if (remaining !== undefined) {
      return Math.max(1, Math.min(size, remaining));
    }

    if (this.options.limit === undefined) {
      return size;
    }

    return Math.max(1, Math.min(size, this.options.limit - this.totalProcessed));
  }

  public get hasReachedLimit(): boolean {
    const goalReached =
      this.options.goal !== undefined && this.totalProcessed >= this.options.goal;
    const limitReached = Boolean(
      this.options.limit && this.totalProcessed >= this.options.limit,
    );

    return goalReached || limitReached;
  }

  public get goalDescription(): string | null {
    if (this.options.goal === undefined) {
      return null;
    }

    const remaining = Math.max(0, this.options.goal - this.totalProcessed);
    return `meta ${this.options.goal} · restantes ${remaining}`;
  }

  public setSelection(selection: SelectionResult): void {
    this.currentSelection = selection;
  }

  public markEmptyPass(): void {
    this.emptyPasses += 1;
  }

  public resetEmptyPasses(): void {
    this.emptyPasses = 0;
  }

  public addProcessed(count: number): void {
    this.totalProcessed += count;
  }

  public get currentThrottleCooldownMs(): number {
    return this.throttleCooldownMs;
  }

  public consumeThrottleCooldownWait(): number {
    const cooldown = this.pendingThrottleCooldownWaitMs;
    this.pendingThrottleCooldownWaitMs = 0;

    return cooldown;
  }

  public increaseLeadingSkip(): number {
    this.leadingItemsToSkip += 1;
    this.consecutiveSkippedKeys += 1;
    this.leadingSkipArmed = true;
    return this.leadingItemsToSkip;
  }

  public armLeadingSkip(): void {
    this.leadingSkipArmed = true;
  }

  public consumeLeadingSkipCount(): number {
    if (!this.leadingSkipArmed) {
      return 0;
    }

    this.leadingSkipArmed = false;
    return this.leadingItemsToSkip;
  }

  public get consecutiveSkippedKeyCount(): number {
    return this.consecutiveSkippedKeys;
  }

  public resetSkippedKeyCounter(): void {
    this.consecutiveSkippedKeys = 0;
    this.leadingItemsToSkip = 1;
  }

  public recordThrottleSignal(): number {
    this.consecutiveThrottleSignals += 1;
    return this.consecutiveThrottleSignals;
  }

  public resetThrottleSignals(): void {
    this.consecutiveThrottleSignals = 0;
  }

  public get throttleSignalCount(): number {
    return this.consecutiveThrottleSignals;
  }

  public increaseThrottleCooldown(): number {
    this.throttleCooldownMs = Math.min(
      maxThrottleCooldownMs,
      this.throttleCooldownMs + throttleCooldownStepMs,
    );
    this.pendingThrottleCooldownWaitMs = this.throttleCooldownMs;

    return this.throttleCooldownMs;
  }

  public reduceThrottleCooldownAfterSuccess(): number {
    this.throttleCooldownMs = Math.max(0, this.throttleCooldownMs - throttleCooldownStepMs);
    this.pendingThrottleCooldownWaitMs = Math.min(
      this.pendingThrottleCooldownWaitMs,
      this.throttleCooldownMs,
    );

    return this.throttleCooldownMs;
  }

  public notifyPhase(phase: ProgressPhase, message: string, details?: string): void {
    const progress =
      this.options.goal === undefined
        ? `acumulado ${this.totalProcessed}`
        : `acumulado ${this.totalProcessed}/${this.options.goal}`;
    this.options.onPhase?.(phase, message, details ?? progress);
  }

  public debug(message: string): void {
    logger.debug(this.formatLogMessage(message));
  }

  public info(message: string): void {
    logger.info(this.formatLogMessage(message));
  }

  public warn(message: string): void {
    logger.warn(this.formatLogMessage(message));
  }

  private formatLogMessage(message: string): string {
    return `[${this.target.mode}] ${message}`;
  }
}
