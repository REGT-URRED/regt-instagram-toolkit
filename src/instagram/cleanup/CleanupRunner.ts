import { waitForDomReady, waitForPageIdle } from '../../browser/waits.js';
import type { CleanupContext } from './CleanupContext.js';
import { BatchActionRunner } from './BatchActionRunner.js';
import { InstagramThrottledError } from '../errors.js';
import { PostVisibilityVerifier } from './PostVisibilityVerifier.js';
import { ScrollManager } from './ScrollManager.js';
import { SelectionManager } from './SelectionManager.js';
import { SelectModeController } from './SelectModeController.js';

const selectedItemsDisappearTimeoutMs = 60_000;
const maxConsecutiveThrottleSignals = 3;
const maxConsecutiveSkippedItems = 3;

export class CleanupRunner {
  private readonly actionRunner: BatchActionRunner;
  private readonly postVisibilityVerifier: PostVisibilityVerifier;
  private readonly scrollManager: ScrollManager;
  private readonly selectionManager: SelectionManager;
  private readonly selectModeController: SelectModeController;

  public constructor(private readonly context: CleanupContext) {
    this.actionRunner = new BatchActionRunner(context);
    this.postVisibilityVerifier = new PostVisibilityVerifier(context);
    this.scrollManager = new ScrollManager(context);
    this.selectionManager = new SelectionManager(context);
    this.selectModeController = new SelectModeController(context);
  }

  public async run(): Promise<number> {
    while (true) {
      if (this.context.hasReachedLimit) {
        this.context.info(`Limit reached: ${this.context.options.limit}`);
        break;
      }

      await this.waitBeforeNextBatchIfThrottled();

      this.context.notifyPhase('select', 'buscando el botón Seleccionar');
      await this.selectModeController.ensure();
      this.context.notifyPhase('select', 'seleccionando elementos');
      const selection = await this.selectionManager.selectBatch(this.context.pickBatchSize());

      if (selection.count === 0) {
        this.context.markEmptyPass();
        this.context.notifyPhase('wait', 'buscando más elementos');
        const scroll = await this.scrollManager.scrollMore();

        if (this.context.emptyPasses >= 3 || scroll.before === scroll.after) {
          this.context.info('No selectable item is visible anymore. Done.');
          break;
        }

        await this.scrollManager.waitAfterEmptyPass();
        continue;
      }

      this.context.resetEmptyPasses();
      this.context.debug(`Selected batch: ${selection.count} item(s).`);
      this.context.notifyPhase('delete', `eliminando ${selection.count} elemento(s)`);

      if (selection.attemptedCount > selection.count) {
        this.context.warn(
          `Instagram registered ${selection.count} selected item(s) after ${selection.attemptedCount} click(s). Continuing with the registered selection only.`,
        );
      }

      if (selection.confirmedCount !== null) {
        this.context.debug(`Instagram selection counter: ${selection.confirmedCount} item(s).`);
      }

      if (this.context.options.dryRun) {
        this.context.addProcessed(selection.count);
        this.context.info('Dry-run mode: no deletion was performed.');
        break;
      }

      const actionResult = await this.actionRunner.run();
      if (actionResult.status === 'recovered-error-dialog') {
        const leadingSkipCount = this.context.increaseLeadingSkip();

        if (this.context.consecutiveSkippedKeyCount >= maxConsecutiveSkippedItems) {
          throw new InstagramThrottledError(
            `Instagram rejected ${this.context.consecutiveSkippedKeyCount} batches in a row even while skipping the first items (${this.context.totalProcessed} successful action(s)). ` +
              'Either several posts are unavailable or the account is temporarily throttled; wait a while before retrying.',
            true,
          );
        }

        this.context.warn(
          `Instagram rejected this batch. Skipping the first ${leadingSkipCount} item(s) of the activity list (the black/unavailable tile at the top breaks the request) and continuing with the rest.`,
        );
        this.context.notifyPhase(
          'wait',
          `saltando ${leadingSkipCount} elemento(s) rechazado(s) · acumulado ${this.context.totalProcessed}`,
        );
        await this.delay(2_000);
        await this.reloadActivityPage();
        continue;
      }

      const remainingSignatures = await this.postVisibilityVerifier.waitForSelectedItemsToDisappear(
        selectedItemsDisappearTimeoutMs,
      );
      if (remainingSignatures.length > 0) {
        const remainingAfterRefresh =
          await this.postVisibilityVerifier.refreshAndCollectRemainingSelectedItems();

        if (remainingAfterRefresh.length > 0) {
          this.handlePossibleThrottle(remainingAfterRefresh);
          this.abortIfInstagramIsThrottling();
          this.context.armLeadingSkip();
          continue;
        }
      }

      const processed = actionResult.count ?? selection.count;
      this.context.addProcessed(processed);
      this.context.resetSkippedKeyCounter();
      this.context.resetThrottleSignals();
      this.context.notifyPhase('done', `lote completado: ${processed}`);
      this.reduceThrottleCooldownAfterSuccess();
      this.context.info(
        `Processed batch: ${processed} item(s). Total processed: ${this.context.totalProcessed}.`,
      );

      await this.waitBetweenBatches();
    }

    return this.context.totalProcessed;
  }

  private async waitBetweenBatches(): Promise<void> {
    if (this.context.hasReachedLimit) {
      return;
    }

    const { min, max } = this.context.options.batchDelay;
    const delay = min + Math.floor(Math.random() * (max - min + 1));

    if (delay <= 0) {
      return;
    }

    this.context.debug(`Waiting ${delay} ms before the next batch.`);
    this.context.notifyPhase('wait', `esperando ${Math.round(delay / 1000)}s antes del siguiente lote`);
    await this.delay(delay);
  }

  private async waitBeforeNextBatchIfThrottled(): Promise<void> {
    const cooldown = this.context.consumeThrottleCooldownWait();

    if (cooldown <= 0) {
      return;
    }

    this.context.warn(
      `Waiting ${this.formatDuration(cooldown)} before the next cleanup batch because Instagram looked throttled.`,
    );
    this.context.notifyPhase('wait', `esperando ${this.formatDuration(cooldown)} por throttling`);
    await this.delay(cooldown);
  }

  private abortIfInstagramIsThrottling(): void {
    const signals = this.context.recordThrottleSignal();
    if (signals < maxConsecutiveThrottleSignals) {
      return;
    }

    throw new InstagramThrottledError(
      `Instagram rejected ${signals} batches in a row (${this.context.totalProcessed} item(s) processed before the limit). ` +
        'This is a temporary Instagram limit, not a tool failure. Wait between 1 and 24 hours before retrying, ' +
        'and use a slower batch rhythm when you come back.',
    );
  }

  private async waitForThrottleAndReload(): Promise<void> {
    const cooldown = this.context.increaseThrottleCooldown();
    this.context.warn(
      `Instagram displayed its error dialog without a specific item to skip. Waiting ${this.formatDuration(cooldown)} because the account looks throttled.`,
    );
    this.context.notifyPhase('wait', `esperando ${this.formatDuration(cooldown)} por throttling`);
    await this.delay(cooldown);
    await this.reloadActivityPage();
  }

  private async reloadActivityPage(): Promise<void> {
    try {
      await this.context.page.reload({ waitUntil: 'domcontentloaded', timeout: 90_000 });
    } catch (error) {
      this.context.warn(
        `Page refresh did not settle cleanly: ${error instanceof Error ? error.message : String(error)}`,
      );
      await this.context.page.goto(this.context.target.url, {
        waitUntil: 'domcontentloaded',
        timeout: 90_000,
      });
    }

    await waitForDomReady(this.context.page, 90_000);
    await waitForPageIdle(this.context.page, 15_000, 1_000);
    this.context.armLeadingSkip();
  }

  private handlePossibleThrottle(remainingSignatures: string[]): void {
    const cooldown = this.context.increaseThrottleCooldown();
    this.context.warn(
      [
        'The same selected items are still visible after a long wait and refresh.',
        'Instagram may be throttling this account or the click delay may be too fast.',
        `Try a slower --click-delay if this repeats. Next retry waits ${this.formatDuration(cooldown)}.`,
        `Still visible item signatures: ${remainingSignatures.slice(0, 5).join(', ')}`,
      ].join(' '),
    );
  }

  private reduceThrottleCooldownAfterSuccess(): void {
    const previousCooldown = this.context.currentThrottleCooldownMs;

    if (previousCooldown <= 0) {
      return;
    }

    const nextCooldown = this.context.reduceThrottleCooldownAfterSuccess();
    if (nextCooldown > 0) {
      this.context.info(
        `Cleanup worked after throttling. Next batch cooldown reduced to ${this.formatDuration(nextCooldown)}.`,
      );
      return;
    }

    this.context.info('Cleanup worked after throttling. Batch cooldown cleared.');
  }

  private formatDuration(durationMs: number): string {
    const seconds = Math.ceil(durationMs / 1000);

    if (seconds < 60) {
      return `${seconds}s`;
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (remainingSeconds === 0) {
      return `${minutes}min`;
    }

    return `${minutes}min ${remainingSeconds}s`;
  }

  private delay(durationMs: number): Promise<void> {
    return new Promise((resolve) => {
      globalThis.setTimeout(resolve, durationMs);
    });
  }
}
