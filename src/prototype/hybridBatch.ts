import { setTimeout as sleep } from 'node:timers/promises';
import type { Page } from 'puppeteer';
import { waitForDomReady, waitForPageIdle } from '../browser/waits.js';
import { BanGuard } from '../core/banGuard.js';
import { invokeCapability, type CapabilitySet } from '../core/capabilities.js';
import { Ledger } from '../core/ledger.js';
import { MutationRecorder } from '../core/mutationRecorder.js';
import { RateGovernor, type RateGovernorSnapshot } from '../core/rateGovernor.js';
import { clickByLabels } from '../instagram/clickByLabels.js';
import {
  clickSelectionTargetByKey,
  collectNextVisibleBatchTarget,
} from '../instagram/cleanup/browser/selectVisibleBatch.js';
import {
  getCheckboxCandidateSelector,
  getSelectableItemsSelector,
} from '../instagram/cleanup/selectors.js';
import { getTranslationValues } from '../translations/loadTranslations.js';
import type { TranslationDictionary } from '../types.js';
import { logger } from '../utils/logger.js';

const activityUrls = {
  likes: 'https://www.instagram.com/your_activity/interactions/likes/',
  comments: 'https://www.instagram.com/your_activity/interactions/comments/',
} as const;

export interface HybridBatchOptions {
  mode: 'likes' | 'comments';
  limit: number;
  dryRun: boolean;
  ledgerPath: string;
  mutationsPath: string;
}

export interface HybridBatchResult {
  processed: number;
  elapsedMs: number;
  itemsPerMinute: number;
  banSignals: number;
  ledgerSize: number;
  governor: RateGovernorSnapshot;
  dryRun: boolean;
}

/**
 * One measurable batch using the hybrid engine: accessibility capabilities for
 * controls, a stable-ID ledger, an AIMD rate governor and a ban guard, with the
 * existing text-based clicks as fallback. Mutation requests are recorded for a
 * future replay path; replay itself stays disabled here.
 */
export async function runHybridBatch(
  page: Page,
  translations: TranslationDictionary,
  capabilities: CapabilitySet,
  options: HybridBatchOptions,
): Promise<HybridBatchResult> {
  const startedAt = Date.now();
  const ledger = new Ledger(options.ledgerPath);
  ledger.load();

  const governor = new RateGovernor({
    initialDelayMs: 220,
    minDelayMs: 120,
    maxDelayMs: 4_000,
  });
  const guard = new BanGuard({
    windowMs: 5 * 60_000,
    pauseThreshold: 2,
    abortThreshold: 4,
    pauseMs: 45_000,
    abortPauseMs: 600_000,
  });
  let banSignals = 0;
  let abortRequested = false;
  let pauseRequested = false;

  new MutationRecorder(options.mutationsPath).attach(page);
  page.on('response', (response) => {
    const url = response.url();
    if (response.status() === 429 && /instagram\.com\/(api|graphql)/.test(url)) {
      banSignals += 1;
      const decision = guard.record();
      governor.recordBan();
      logger.warn(`[hybrid] Ban signal (HTTP 429). Level=${decision}, signals=${banSignals}.`);
      if (decision === 'abort') {
        abortRequested = true;
      }
      if (decision === 'pause') {
        pauseRequested = true;
      }
    }
  });

  const respectBanGuard = async (): Promise<void> => {
    if (abortRequested) {
      throw new Error(
        `Aborting to protect the account: ${banSignals} ban signals in the window. Wait before retrying.`,
      );
    }
    if (pauseRequested) {
      pauseRequested = false;
      const cooldown = guard.cooldownFor('pause');
      logger.warn(`[hybrid] Pausing ${Math.round(cooldown / 1000)}s after ban signals.`);
      await sleep(cooldown);
    }
  };

  const activityUrl = activityUrls[options.mode];
  logger.info(`[hybrid] Opening ${activityUrl}`);
  await page.goto(activityUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await waitForDomReady(page);
  await waitForPageIdle(page, 3_000, 500);

  const isLikes = options.mode === 'likes';
  const selectLabels = getTranslationValues(translations, ['select']);
  const actionLabels = getTranslationValues(translations, isLikes ? ['unlike'] : ['delete']);
  const confirmLabels = getTranslationValues(
    translations,
    isLikes ? ['unlike', 'remove', 'confirm'] : ['delete', 'confirm'],
  );
  const actionRule = isLikes ? capabilities.action : { role: 'button', names: actionLabels };
  const confirmRule = isLikes
    ? capabilities.confirm
    : { role: 'button', names: confirmLabels, scope: 'dialog' as const };

  const selected =
    (await invokeCapability(page, capabilities.select)) ||
    (await clickByLabels(page, selectLabels, {
      timeout: 8_000,
      includeTextElements: true,
      debugName: 'Select',
    }));
  if (!selected) {
    throw new Error('The Select control was not found through capabilities or labels.');
  }

  await sleep(1_500);

  const ids: string[] = [];
  let clicked = 0;
  let skipped = 0;
  let emptyAttempts = 0;

  while (clicked < options.limit) {
    const target = await page.evaluate(collectNextVisibleBatchTarget, {
      checkboxSelector: getCheckboxCandidateSelector(),
      controlText: getTranslationValues(translations, ['select', 'unlike', 'delete']),
      ignoredKeys: ids,
    });

    if (!target) {
      emptyAttempts += 1;
      const scrolled = await page.evaluate(() => {
        const box = document.querySelector('[data-testid="bulk_action_checkbox"]');
        let element = box?.parentElement ?? null;
        while (element && element !== document.body) {
          const style = getComputedStyle(element);
          if (
            (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
            element.scrollHeight > element.clientHeight + 10
          ) {
            const before = element.scrollTop;
            element.scrollBy(0, Math.round(element.clientHeight * 0.8));
            return element.scrollTop !== before;
          }
          element = element.parentElement;
        }
        const before = window.scrollY;
        window.scrollBy(0, Math.round(window.innerHeight * 0.8));
        return window.scrollY !== before;
      });

      if (!scrolled && emptyAttempts >= 8) {
        break;
      }
      await sleep(scrolled ? 1_200 : 300);
      continue;
    }

    emptyAttempts = 0;

    ids.push(target.key);

    if (ledger.has(target.key)) {
      skipped += 1;
      continue;
    }

    const ok = await page.evaluate(clickSelectionTargetByKey, {
      checkboxSelector: getSelectableItemsSelector(),
      controlText: getTranslationValues(translations, ['select', 'unlike', 'delete']),
      key: target.key,
    });

    if (ok) {
      clicked += 1;
    }

    await respectBanGuard();
    await governor.wait();
  }

  if (clicked === 0) {
    logger.warn('[hybrid] No selectable item was found.');
    return buildResult({
      clicked: 0,
      skipped,
      startedAt,
      governor,
      guard,
      ledger,
      banSignals,
      options,
    });
  }

  if (options.dryRun) {
    logger.info(`[hybrid] Dry run: ${clicked} item(s) selected, no deletion performed.`);
    return buildResult({
      clicked,
      skipped,
      startedAt,
      governor,
      guard,
      ledger,
      banSignals,
      options,
    });
  }

  await respectBanGuard();

  await governor.wait();
  const acted =
    (await invokeCapability(page, actionRule, 6_000)) ||
    (await clickByLabels(page, actionLabels, {
      timeout: 6_000,
      preferLast: true,
      debugName: 'Cleanup action',
    }));
  if (!acted) {
    throw new Error('The cleanup action control was not found.');
  }

  await governor.wait();
  const confirmed =
    (await invokeCapability(page, confirmRule, 8_000)) ||
    (await clickByLabels(page, confirmLabels, {
      timeout: 8_000,
      preferLast: true,
      insideDialog: true,
      debugName: 'Cleanup confirmation',
    }));
  if (!confirmed) {
    throw new Error('The cleanup confirmation control was not found.');
  }

  await sleep(2_000);

  const pageShowsBanText = await page.evaluate(() => {
    const text = (document.body.innerText || '').toLowerCase();
    return (
      text.includes('desmarcar algunos') ||
      text.includes('unselect some') ||
      text.includes('try again later') ||
      text.includes('intenta de nuevo mas tarde')
    );
  });
  if (pageShowsBanText) {
    banSignals += 1;
    const decision = guard.record();
    governor.recordBan();
    logger.warn(`[hybrid] Ban signal (UI text). Level=${decision}, signals=${banSignals}.`);

    if (decision === 'abort') {
      throw new Error(
        `Aborting to protect the account: ${banSignals} ban signals in the window. Wait before retrying.`,
      );
    }
    if (decision === 'pause') {
      logger.warn(`[hybrid] Pausing ${Math.round(guard.cooldownFor(decision) / 1000)}s.`);
      await sleep(guard.cooldownFor(decision));
    }
  }

  for (const id of ids.slice(0, clicked)) {
    ledger.mark(id, confirmed ? 'processed' : 'failed');
  }

  if (confirmed) {
    governor.recordSuccess();
  }

  logger.info(`[hybrid] Recorded ${ledger.size} stable id(s) in the ledger.`);
  return buildResult({ clicked, skipped, startedAt, governor, guard, ledger, banSignals, options });
}

function buildResult(args: {
  clicked: number;
  skipped: number;
  startedAt: number;
  governor: RateGovernor;
  guard: BanGuard;
  ledger: Ledger;
  banSignals: number;
  options: HybridBatchOptions;
}): HybridBatchResult {
  const elapsedMs = Date.now() - args.startedAt;
  const result: HybridBatchResult = {
    processed: args.clicked,
    elapsedMs,
    itemsPerMinute: elapsedMs > 0 ? Number(((args.clicked / elapsedMs) * 60_000).toFixed(1)) : 0,
    banSignals: args.banSignals,
    ledgerSize: args.ledger.size,
    governor: args.governor.snapshot(),
    dryRun: args.options.dryRun,
  };

  if (args.skipped > 0) {
    logger.info(`[hybrid] Skipped ${args.skipped} item(s) already in the ledger.`);
  }

  logger.info(
    `[hybrid] processed=${result.processed} elapsed=${Math.round(
      elapsedMs / 1000,
    )}s rate=${result.itemsPerMinute}/min delay=${result.governor.delayMs}ms bans=${result.banSignals}`,
  );

  return result;
}
