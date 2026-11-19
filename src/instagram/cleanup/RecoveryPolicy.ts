/**
 * Deterministic "good path / bad path" policy for the cleanup loop.
 *
 * Every batch walks the same happy path:
 *   select mode -> select items -> click action -> (optional) confirm -> verify.
 * When a step breaks, the failure is classified into one of the known kinds
 * below. Each kind has a bounded recovery path and an attempt limit, so the
 * loop can never spin forever against Instagram.
 */
export type CleanupFailureKind =
  | 'action-button-missing'
  | 'confirmation-missing'
  | 'instagram-error-dialog'
  | 'unacknowledged-batch'
  | 'items-still-visible'
  | 'navigation-lost';

export type RecoveryStep = 'reload-and-retry' | 'abort';

export interface RecoveryDecision {
  readonly kind: CleanupFailureKind;
  readonly step: RecoveryStep;
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly delayMs: number;
  readonly message: string;
}

const defaultLimits: Record<CleanupFailureKind, number> = {
  'action-button-missing': 2,
  'confirmation-missing': 2,
  'instagram-error-dialog': 3,
  'unacknowledged-batch': 2,
  'items-still-visible': 3,
  'navigation-lost': 2,
};

const failureTitles: Record<CleanupFailureKind, string> = {
  'action-button-missing': 'the cleanup action button was not found',
  'confirmation-missing': 'the cleanup confirmation could not be completed',
  'instagram-error-dialog': 'Instagram displayed its error dialog',
  'unacknowledged-batch': 'Instagram did not acknowledge the batch',
  'items-still-visible': 'the selected items are still visible after the batch',
  'navigation-lost': 'the Instagram page was lost during the batch',
};

const failureDelays: Record<CleanupFailureKind, number> = {
  'action-button-missing': 2_000,
  'confirmation-missing': 2_000,
  'instagram-error-dialog': 3_000,
  'unacknowledged-batch': 3_000,
  'items-still-visible': 5_000,
  'navigation-lost': 1_500,
};

export class RecoveryPolicy {
  private readonly attempts = new Map<CleanupFailureKind, number>();

  public constructor(
    private readonly limits: Record<CleanupFailureKind, number> = defaultLimits,
  ) {}

  public registerFailure(kind: CleanupFailureKind): RecoveryDecision {
    const attempt = (this.attempts.get(kind) ?? 0) + 1;
    this.attempts.set(kind, attempt);
    const maxAttempts = this.limits[kind];

    if (attempt > maxAttempts) {
      return {
        kind,
        step: 'abort',
        attempt,
        maxAttempts,
        delayMs: 0,
        message:
          `Instagram failed ${maxAttempts} time(s) in a row because ${failureTitles[kind]}. ` +
          'The cleanup stopped instead of retrying forever. Wait between 1 and 24 hours and try ' +
          'again with a slower batch rhythm.',
      };
    }

    return {
      kind,
      step: 'reload-and-retry',
      attempt,
      maxAttempts,
      delayMs: failureDelays[kind],
      message:
        `Recovering (attempt ${attempt}/${maxAttempts}): ${failureTitles[kind]}. ` +
        'Reloading the activity page and continuing with the rest of the list.',
    };
  }

  public clearFailure(kind: CleanupFailureKind): void {
    this.attempts.delete(kind);
  }

  public resetAll(): void {
    this.attempts.clear();
  }

  public get hasFailures(): boolean {
    return this.attempts.size > 0;
  }

  public static classifyActionFailure(message: string): CleanupFailureKind {
    const normalized = message.toLowerCase();

    if (normalized.includes('confirmation')) {
      return 'confirmation-missing';
    }

    if (normalized.includes('action button')) {
      return 'action-button-missing';
    }

    if (
      normalized.includes('detached') ||
      normalized.includes('target closed') ||
      normalized.includes('execution context') ||
      normalized.includes('navigation')
    ) {
      return 'navigation-lost';
    }

    if (normalized.includes('http 5') || normalized.includes('request failed')) {
      return 'instagram-error-dialog';
    }

    return 'unacknowledged-batch';
  }
}
