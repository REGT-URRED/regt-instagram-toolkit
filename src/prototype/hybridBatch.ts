import { setTimeout as sleep } from 'node:timers/promises';
import type { Page } from 'puppeteer';
import { waitForDomReady, waitForPageIdle } from '../browser/waits.js';
import { BanGuard } from '../core/banGuard.js';
import { invokeCapability, type CapabilitySet } from '../core/capabilities.js';
import { Ledger } from '../core/ledger.js';
import { MutationRecorder } from '../core/mutationRecorder.js';
import { RateGovernor, type RateGovernorSnapshot } from '../core/rateGovernor.js';
import { clickByLabels } from '../instagram/clickByLabels.js';
import { selectBatchInPage } from '../instagram/cleanup/browser/selectVisibleBatch.js';
import { getCheckboxCandidateSelector } from '../instagram/cleanup/selectors.js';
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
  const timings: {
    gotoMs?: number;
    listWaitMs?: number;
    selectModeMs?: number;
    selectionMs?: number;
    actionMs?: number;
    confirmMs?: number;
    mutationMs?: number;
  } = {};
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
  let mutationSeen = false;

  page.on('response', (response) => {
    const request = response.request();
    const url = response.url();
    const postData = request.postData() ?? '';
    const isMutationEndpoint =
      /instagram\.com\/(api|graphql)/.test(url) || /\/async\/wbloks\/fetch\//.test(url);
    if (
      request.method() !== 'GET' &&
      isMutationEndpoint &&
      response.status() >= 200 &&
      response.status() < 300 &&
      /(delete|unlike|block)/i.test(`${url} ${postData}`)
    ) {
      mutationSeen = true;
    }
  });

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
  // The activity list virtualizes rows to the viewport; a taller window renders
  // more checkboxes and removes the per-item scroll round trips.
  const gotoStartedAt = Date.now();
  await page.setViewport({ width: 1280, height: 1800 });
  await page.goto(activityUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await waitForDomReady(page);
  await waitForPageIdle(page, 3_000, 500);
  timings.gotoMs = Date.now() - gotoStartedAt;

  const listState = await waitForActivityList(page, 15_000);
  timings.listWaitMs = listState.waitedMs;
  if (listState.state === 'empty') {
    logger.info('[hybrid] The activity list is empty; nothing left to do.');
    return buildResult({ clicked: 0, startedAt, governor, guard, ledger, banSignals, options });
  }
  if (listState.state === 'timeout') {
    throw new Error(
      'The activity list stayed blank for 15s; stopping before retrying (Instagram may be throttling).',
    );
  }

  const isLikes = options.mode === 'likes';
  // Instagram disables the toolbar at 99 selections ("Desmarcar algunos…"),
  // so a batch never exceeds 95 even if the caller asks for more.
  const batchLimit = Math.min(options.limit, 95);
  const debugEnabled = process.env['HYBRID_DEBUG'] === '1';
  const debugState = async (phase: string): Promise<void> => {
    if (!debugEnabled) {
      return;
    }
    const state = await page.evaluate(() => {
      const isVisible = (element: Element): boolean => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const labels = Array.from(
        document.querySelectorAll('button,[role="button"],div,span'),
      ).filter(
        (element) =>
          isVisible(element) && (element as HTMLElement).innerText.trim() === 'Eliminar',
      );
      return {
        rows: document.querySelectorAll('[data-testid="post_collection_item"]').length,
        checkboxes: document.querySelectorAll('[data-testid="bulk_action_checkbox"]').length,
        checked: document.querySelectorAll(
          '[data-testid="bulk_action_checkbox"] [aria-checked="true"],[data-testid="bulk_action_checkbox"] [aria-selected="true"]',
        ).length,
        eliminar: labels.map((element) => {
          const rect = element.getBoundingClientRect();
          return `${element.tagName}@${Math.round(rect.top)},${Math.round(rect.left)}`;
        }),
        dialogText: document.body.innerText.includes('¿Eliminar comentarios?'),
        dialogs: document.querySelectorAll('[role="dialog"],[aria-modal="true"]').length,
      };
    });
    logger.info(`[hybrid][debug] ${phase} ${JSON.stringify(state)}`);
  };
  const selectLabels = getTranslationValues(translations, ['select']);
  const actionLabels = getTranslationValues(translations, isLikes ? ['unlike'] : ['delete']);
  const confirmLabels = getTranslationValues(
    translations,
    isLikes ? ['unlike', 'remove', 'confirm'] : ['delete', 'confirm'],
  );
  const actionRule = isLikes
    ? { ...capabilities.action, preferLast: true }
    : { role: 'button', names: actionLabels, preferLast: true };
  const confirmRule = isLikes
    ? { ...capabilities.confirm, scope: 'dialog' as const, preferLast: true }
    : { role: 'button', names: confirmLabels, scope: 'dialog' as const, preferLast: true };

  const selectStartedAt = Date.now();
  const selected = await activateSelectMode(page, selectLabels);
  timings.selectModeMs = Date.now() - selectStartedAt;
  if (!selected) {
    throw new Error('The Select control did not enter selection mode.');
  }

  await sleep(1_500);

  const controlText = getTranslationValues(translations, ['select', 'unlike', 'delete']);
  const selectionInput = {
    checkboxSelector: getCheckboxCandidateSelector(),
    controlText,
    limit: batchLimit,
    minDelayMs: 20,
    maxDelayMs: 40,
  };
  const fastStartedAt = Date.now();
  let fastSelection;
  try {
    fastSelection = await page.evaluate(selectBatchInPage, selectionInput);
  } catch (error) {
    logger.warn('[hybrid] Selection context was interrupted; reloading once.');
    try {
      await page.goto(activityUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await waitForDomReady(page);
      await waitForPageIdle(page, 2_000, 300);
      if (!(await activateSelectMode(page, selectLabels))) {
        throw new Error('The list did not enter selection mode after reloading.', {
          cause: error,
        });
      }
      fastSelection = await page.evaluate(selectBatchInPage, selectionInput);
    } catch (retryError) {
      throw new Error(
        `Instagram did not recover after reloading (${String(
          error,
        )}); stopping before touching the account again: ${String(retryError)}`,
        { cause: retryError },
      );
    }
  }
  timings.selectionMs = Date.now() - fastStartedAt;
  if (debugEnabled) {
    logger.info(
      `[hybrid][debug] fast ms=${timings.selectionMs} rounds=${fastSelection.rounds} history=${fastSelection.history.join(',')}`,
    );
  }
  const clickedIds = fastSelection.clickedKeys;
  const clicked = clickedIds.length;
  if (fastSelection.exhausted && clicked < batchLimit) {
    logger.info(`[hybrid] Selected ${clicked} visible item(s); no more candidates in view.`);
  }

  await debugState('selected');
  await sleep(1_000);

  if (clicked === 0) {
    logger.warn('[hybrid] No selectable item was found.');
    return buildResult({
      clicked: 0,
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
  const actionStartedAt = Date.now();
  const actedByDom = await clickActionByDom(page, actionLabels);
  const actedByLabel = actedByDom
    ? false
    : await clickByLabels(page, actionLabels, {
        timeout: 6_000,
        preferLast: true,
        debugName: 'Cleanup action',
      });
  const acted =
    actedByDom || actedByLabel || (await invokeCapability(page, actionRule, 6_000));
  timings.actionMs = Date.now() - actionStartedAt;
  if (debugEnabled) {
    logger.info(`[hybrid][debug] action label=${actedByLabel} capability=${!actedByLabel}`);
  }
  if (!acted) {
    throw new Error('The cleanup action control was not found.');
  }
  await debugState('after-action');

  // Instagram sometimes deletes straight from the toolbar and sometimes opens a
  // confirmation sheet; give the toolbar a beat and retry once if nothing happened.
  await sleep(1_200);
  if (!mutationSeen) {
    const dialogOpen = await page.evaluate(() => {
      const text = document.body.innerText;
      return (
        text.includes('¿Eliminar comentarios?') ||
        document.querySelectorAll('[role="dialog"],[aria-modal="true"]').length > 0
      );
    });
    if (!dialogOpen) {
      await clickActionByDom(page, actionLabels);
      await sleep(800);
      const stillClosed = await page.evaluate(() => {
        const text = document.body.innerText;
        return (
          !text.includes('¿Eliminar comentarios?') &&
          document.querySelectorAll('[role="dialog"],[aria-modal="true"]').length === 0
        );
      });
      if (stillClosed) {
        await clickByLabels(page, actionLabels, {
          timeout: 4_000,
          preferLast: true,
          debugName: 'Cleanup action retry',
        });
        await sleep(800);
      }
    }
  }

  // Instagram sometimes deletes straight from the toolbar and sometimes opens a
  // confirmation sheet; wait briefly for the direct mutation before confirming.
  const directDeadline = Date.now() + 2_500;
  while (!mutationSeen && Date.now() < directDeadline) {
    await sleep(200);
  }

  const mutationStartedAt = Date.now();
  if (!mutationSeen) {
    await sleep(600);
    await governor.wait();
    const confirmStartedAt = Date.now();
    const confirmedByLabel = await clickByLabels(page, confirmLabels, {
      timeout: 3_000,
      preferLast: true,
      insideDialog: true,
      debugName: 'Cleanup confirmation',
    });
    const confirmed =
      confirmedByLabel ||
      (await invokeCapability(page, confirmRule, 3_000)) ||
      (await clickDialogConfirm(page, confirmLabels));
    timings.confirmMs = Date.now() - confirmStartedAt;
    if (debugEnabled) {
      logger.info(`[hybrid][debug] confirm label=${confirmedByLabel} any=${confirmed}`);
    }
    await debugState('after-confirm');
    if (!confirmed) {
      throw new Error('The cleanup confirmation control was not found.');
    }

    const mutationDeadline = Date.now() + 6_000;
    while (!mutationSeen && Date.now() < mutationDeadline) {
      await sleep(200);
    }
  }

  timings.mutationMs = Date.now() - mutationStartedAt;
  if (!mutationSeen) {
    for (const id of clickedIds) {
      ledger.mark(id, 'failed');
    }
    throw new Error(
      'No successful delete/unlike request was observed. Nothing was marked as processed.',
    );
  }

  await sleep(1_000);

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

  for (const id of clickedIds) {
    ledger.mark(id, 'processed');
  }
  governor.recordSuccess();

  logger.debug(
    `[hybrid] timings goto=${timings.gotoMs ?? 0}ms list=${timings.listWaitMs ?? 0}ms select=${timings.selectModeMs ?? 0}ms selection=${timings.selectionMs ?? 0}ms action=${timings.actionMs ?? 0}ms confirm=${timings.confirmMs ?? 0}ms mutation=${timings.mutationMs ?? 0}ms`,
  );
  logger.info(`[hybrid] Recorded ${ledger.size} stable id(s) in the ledger.`);
  return buildResult({ clicked, startedAt, governor, guard, ledger, banSignals, options });
}

async function waitForActivityList(
  page: Page,
  timeoutMs: number,
): Promise<{ state: 'ready' | 'empty' | 'timeout'; waitedMs: number }> {
  const startedAt = Date.now();

  for (;;) {
    const state = await page.evaluate(() => {
      const rows = document.querySelectorAll('[data-testid="post_collection_item"]').length;
      const text = (document.body.innerText || '').toLowerCase();
      const empty =
        text.includes('no hay comentarios') ||
        text.includes('no comments') ||
        text.includes('aún no hay') ||
        text.includes('nothing here') ||
        text.includes('sin comentarios');
      return { rows, empty };
    });

    if (state.rows > 0) {
      return { state: 'ready', waitedMs: Date.now() - startedAt };
    }
    if (state.empty) {
      return { state: 'empty', waitedMs: Date.now() - startedAt };
    }
    if (Date.now() - startedAt >= timeoutMs) {
      return { state: 'timeout', waitedMs: Date.now() - startedAt };
    }
    await sleep(1_000);
  }
}

async function activateSelectMode(page: Page, labels: string[]): Promise<boolean> {
  const words = labels.map((label) => label.trim().toLowerCase()).filter(Boolean);
  const clicked = await page.evaluate((normalized: string[]) => {
    const isVisible = (element: Element): boolean => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const matches = Array.from(
      document.querySelectorAll('div,span,button,[role="button"]'),
    ).filter(
      (element) =>
        isVisible(element) &&
        normalized.includes(((element as HTMLElement).innerText || '').trim().toLowerCase()),
    );
    const target = matches.at(-1);
    const clickable = target
      ? (target.closest('button,[role="button"]') ?? target)
      : null;
    (clickable as HTMLElement | null)?.click();
    return Boolean(clickable);
  }, words);

  if (!clicked) {
    return false;
  }

  try {
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid="bulk_action_checkbox"]').length > 0,
      { timeout: 8_000, polling: 200 },
    );
    return true;
  } catch {
    return false;
  }
}

async function clickActionByDom(page: Page, labels: string[]): Promise<boolean> {
  const words = labels.map((label) => label.trim().toLowerCase()).filter(Boolean);
  return page.evaluate((normalized: string[]) => {
    const isVisible = (element: Element): boolean => {
      if (element.closest('[aria-hidden="true"]')) {
        return false;
      }
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none'
      );
    };
    const matches = Array.from(
      document.querySelectorAll('div,span,button,[role="button"]'),
    ).filter(
      (element) =>
        isVisible(element) &&
        normalized.includes(((element as HTMLElement).innerText || '').trim().toLowerCase()),
    );
    const target = matches.at(-1);
    const clickable = target ? (target.closest('button,[role="button"]') ?? target) : null;
    (clickable as HTMLElement | null)?.click();
    return Boolean(clickable);
  }, words);
}

async function clickDialogConfirm(page: Page, labels: string[]): Promise<boolean> {
  return page.evaluate((confirmLabels: string[]) => {
    const normalized = confirmLabels.map((label) => label.trim().toLowerCase());
    const visible = (element: Element): boolean => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const candidates = Array.from(
      document.querySelectorAll('button,[role="button"],div,span'),
    )
      .filter(
        (element) =>
          visible(element) &&
          normalized.includes((element as HTMLElement).innerText.trim().toLowerCase()),
      )
      .reverse();
    const target =
      candidates.find((element) => {
        let current: HTMLElement | null = element as HTMLElement;
        for (let depth = 0; current && depth < 10; depth += 1) {
          if ((current.innerText || '').includes('?')) {
            return true;
          }
          current = current.parentElement;
        }
        return false;
      }) ?? candidates.at(-1);
    (target as HTMLElement | undefined)?.click();
    return Boolean(target);
  }, labels);
}

function buildResult(args: {
  clicked: number;
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

  logger.info(
    `[hybrid] processed=${result.processed} elapsed=${Math.round(
      elapsedMs / 1000,
    )}s rate=${result.itemsPerMinute}/min delay=${result.governor.delayMs}ms bans=${result.banSignals}`,
  );

  return result;
}
