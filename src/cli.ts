#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Browser, Page } from 'puppeteer';
import { launchBrowser, type BrowserSessionOptions } from './browser/launchBrowser.js';
import { waitForDomReady, waitForPageIdle } from './browser/waits.js';
import { parseCliOptions } from './cli/parseCliOptions.js';
import { loadCapabilities } from './core/capabilities.js';
import { blockAccounts } from './instagram/block/blockAccounts.js';
import { parseAccountsFile } from './instagram/block/accountList.js';
import { cleanupHistory } from './instagram/cleanup.js';
import { applyDateFilter } from './instagram/dateFilter.js';
import { waitForInstagramLogin } from './instagram/session.js';
import { buildTarget } from './instagram/targets.js';
import { runHybridBatch } from './prototype/hybridBatch.js';
import { getTranslationValues, loadTranslations } from './translations/loadTranslations.js';
import type {
  CleanupOptions,
  CliOptions,
  TargetConfiguration,
  TranslationDictionary,
} from './types.js';
import { configureDesktopNotifications, notifyCleanupDone } from './utils/desktopNotification.js';
import { logger, setLogLevel } from './utils/logger.js';
import { formatRange } from './utils/time.js';

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);
const rootDirectory = path.resolve(currentDirectory, '..');
const browserCloseTimeoutMs = 5_000;
const cleanupRecoveryNavigationTimeoutMs = 120_000;
const cleanupRecoveryRetryDelayMs = 10_000;

type ShutdownSignal = 'SIGINT' | 'SIGTERM' | 'SIGHUP';

interface BrowserLifecycle {
  close(reason: string): Promise<void>;
  uninstall(): void;
}

interface CleanupJob {
  page: Page;
  target: TargetConfiguration;
}

function logRunConfiguration(options: CliOptions): void {
  logger.debug(`Modes: ${options.modes.join(', ')}`);
  logger.debug(`Period: ${formatRange(options.range)}`);
  logger.debug(`Batch size: ${options.batchSize.min}:${options.batchSize.max} items`);
  logger.debug(`Click delay: ${options.clickDelay.min}:${options.clickDelay.max} ms`);
  logger.debug(`Batch delay: ${options.batchDelay.min}:${options.batchDelay.max} ms`);
  logger.debug(`Recover on error: ${options.recoverOnError ? 'enabled' : 'disabled'}`);
}

function buildBrowserSessionOptions(options: CliOptions): BrowserSessionOptions {
  return {
    rootDir: rootDirectory,
    browser: options.browser,
    useSystemProfile: options.useSystemProfile,
    noSandbox: options.noSandbox,
    ...(options.profileDir !== undefined ? { profileDir: options.profileDir } : {}),
    ...(options.profileName !== undefined ? { profileName: options.profileName } : {}),
    ...(options.chromeExecutablePath !== undefined
      ? { chromeExecutablePath: options.chromeExecutablePath }
      : {}),
  };
}

function buildCleanupOptions(options: CliOptions): CleanupOptions {
  const cleanupOptions: CleanupOptions = {
    batchSize: options.batchSize,
    clickDelay: options.clickDelay,
    batchDelay: options.batchDelay,
    confirmDelay: options.confirmDelay,
    toastTimeoutMs: options.toastTimeoutMs,
    errorDialogTimeoutMs: options.errorDialogTimeoutMs,
    dryRun: options.dryRun,
  };

  if (options.limit !== undefined) {
    cleanupOptions.limit = options.limit;
  }

  return cleanupOptions;
}

function signalExitCode(signal: ShutdownSignal): number {
  return 128 + (signal === 'SIGINT' ? 2 : signal === 'SIGTERM' ? 15 : 1);
}

async function closeBrowser(browser: Browser, reason: string): Promise<void> {
  if (!browser.connected) {
    return;
  }

  logger.debug(`Closing Chrome (${reason}).`);

  let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timeoutId = globalThis.setTimeout(() => resolve('timeout'), browserCloseTimeoutMs);
  });
  const closed = browser.close().then(() => 'closed' as const);
  let result: 'closed' | 'timeout';

  try {
    result = await Promise.race([closed, timeout]);
  } catch (error) {
    browser.process()?.kill('SIGKILL');
    throw error;
  } finally {
    if (timeoutId) {
      globalThis.clearTimeout(timeoutId);
    }
  }

  if (result === 'timeout') {
    logger.warn('Chrome did not close in time. Killing the browser process.');
    browser.process()?.kill('SIGKILL');
  }
}

function installBrowserLifecycle(browser: Browser): BrowserLifecycle {
  let cleanupPromise: Promise<void> | null = null;

  const cleanup = (reason: string): Promise<void> => {
    cleanupPromise ??= closeBrowser(browser, reason);
    return cleanupPromise;
  };

  const handleSignal = (signal: ShutdownSignal): void => {
    void cleanup(signal)
      .catch((error: unknown) => {
        logger.error(
          `Error while closing Chrome: ${error instanceof Error ? error.message : String(error)}`,
        );
      })
      .finally(() => {
        process.exit(signalExitCode(signal));
      });
  };

  process.once('SIGINT', handleSignal);
  process.once('SIGTERM', handleSignal);
  process.once('SIGHUP', handleSignal);

  return {
    close: cleanup,
    uninstall(): void {
      process.off('SIGINT', handleSignal);
      process.off('SIGTERM', handleSignal);
      process.off('SIGHUP', handleSignal);
    },
  };
}

function createCleanupJobs(firstPage: Page, targets: TargetConfiguration[]): CleanupJob[] {
  const jobs: CleanupJob[] = [];
  firstPage.setDefaultTimeout(30_000);

  for (const target of targets) {
    jobs.push({ page: firstPage, target });
  }

  return jobs;
}

async function runCleanupJob(
  job: CleanupJob,
  translations: TranslationDictionary,
  options: CliOptions,
): Promise<number> {
  const { page, target } = job;

  logger.info(`[${target.mode}] Opening activity page.`);
  await page.bringToFront();
  await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await waitForDomReady(page);
  await waitForPageIdle(page, 3_000, 500);
  await applyDateFilter(page, options.range, translations);

  const total = await cleanupHistory(page, target, translations, buildCleanupOptions(options));

  logger.info(`[${target.mode}] Done. Selected/processed items: ${total}.`);
  return total;
}

async function runCleanupJobs(
  jobs: CleanupJob[],
  translations: TranslationDictionary,
  options: CliOptions,
): Promise<number> {
  let total = 0;

  for (const job of jobs) {
    total += await runCleanupJob(job, translations, options);
  }

  return total;
}

async function runCleanupLoop(
  page: Page,
  jobs: CleanupJob[],
  translations: TranslationDictionary,
  options: CliOptions,
): Promise<boolean> {
  while (true) {
    try {
      await waitForInstagramLogin(page, options.loginTimeout);
      const total = await runCleanupJobs(jobs, translations, options);

      logger.info(`Done. Total selected/processed items: ${total}.`);
      return true;
    } catch (error) {
      if (!options.recoverOnError) {
        logger.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
        return false;
      }

      await recoverCleanupLoop(page, jobs, error);
    }
  }
}

async function recoverCleanupLoop(page: Page, jobs: CleanupJob[], error: unknown): Promise<void> {
  const target = jobs[0]?.target;
  logger.warn(
    [
      'Cleanup lost track of the Instagram page.',
      `Reason: ${error instanceof Error ? error.message : String(error)}`,
      'Refreshing the activity page and restarting the cleanup loop.',
    ].join(' '),
  );

  if (!target) {
    await delay(cleanupRecoveryRetryDelayMs);
    return;
  }

  try {
    await page.bringToFront();
    await page.goto(target.url, {
      waitUntil: 'domcontentloaded',
      timeout: cleanupRecoveryNavigationTimeoutMs,
    });
    await waitForDomReady(page, cleanupRecoveryNavigationTimeoutMs);
    await waitForPageIdle(page, 15_000, 1_000);
  } catch (recoveryError) {
    logger.warn(
      [
        'Could not refresh the activity page cleanly.',
        `Reason: ${recoveryError instanceof Error ? recoveryError.message : String(recoveryError)}`,
        `Retrying in ${Math.ceil(cleanupRecoveryRetryDelayMs / 1000)}s.`,
      ].join(' '),
    );
    await delay(cleanupRecoveryRetryDelayMs);
  }
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, durationMs);
  });
}

async function main(): Promise<void> {
  const options = parseCliOptions(rootDirectory);
  setLogLevel(options.logLevel);
  configureDesktopNotifications({ prompts: options.notifyPrompts, done: options.notifyDone });
  const translations = loadTranslations(options.translationsPath);
  const targets = options.modes.map((mode) => buildTarget(mode, translations));

  logRunConfiguration(options);

  const { browser, page, profileDirectory, userDataDir } = await launchBrowser(
    buildBrowserSessionOptions(options),
  );

  logger.debug(`Chrome profile: ${userDataDir}`);
  if (profileDirectory) {
    logger.debug(`Chrome profile directory: ${profileDirectory}`);
  }

  const browserLifecycle = installBrowserLifecycle(browser);

  try {
    let keepBrowserOpen = true;

    if (options.hybrid) {
      await waitForInstagramLogin(page, options.loginTimeout);
      const capabilities = loadCapabilities(path.join(rootDirectory, 'capabilities.json'));
      const maxPasses = Math.max(0, Math.min(50, options.hybridPasses));
      const maxBatch = Math.min(options.limit ?? 95, 95);
      const passLimit = maxPasses === 0 ? 50 : maxPasses;
      let batchSize = Math.min(maxBatch, 20);
      let growthCeiling = maxBatch;
      let processed = 0;
      let lastResult: Awaited<ReturnType<typeof runHybridBatch>> | null = null;
      let pass = 0;
      let failures = 0;

      while (pass < passLimit) {
        pass += 1;
        try {
          const result = await runHybridBatch(page, translations, capabilities, {
            mode: options.modes.includes('comments') ? 'comments' : 'likes',
            limit: batchSize,
            dryRun: options.dryRun,
            ledgerPath: path.join(rootDirectory, '.state/ledger.jsonl'),
            mutationsPath: path.join(rootDirectory, '.state/mutations.jsonl'),
          });
          processed += result.processed;
          lastResult = result;
          logger.info(
            `Lote ${pass}: ${result.processed} borrados · ${Math.round(
              result.elapsedMs / 1000,
            )} s · lote ${batchSize} · total ${processed}`,
          );
          logger.debug(`Hybrid pass raw ${JSON.stringify(result)}`);
          failures = 0;
          if (options.dryRun || result.processed === 0) {
            break;
          }
          if (result.processed >= batchSize && batchSize < maxBatch) {
            const grown = Math.min(
              growthCeiling,
              Math.max(batchSize + 20, Math.floor(batchSize * 1.5)),
            );
            logger.debug(`[hybrid] Growing batch ${batchSize} -> ${grown}`);
            batchSize = grown;
          }
        } catch (error) {
          failures += 1;
          if (failures >= 3) {
            throw error;
          }
          growthCeiling = Math.min(growthCeiling, Math.max(20, batchSize - 1));
          batchSize = Math.max(20, Math.floor(batchSize / 2));
          const cooldown = 8_000 * failures;
          logger.warn(
            `[hybrid] Pass failed; growth ceiling ${growthCeiling}, backing off to batch ${batchSize} in ${cooldown / 1000}s (${String(error)})`,
          );
          await sleep(cooldown);
        }
      }

      logger.info(
        `Total: ${processed} borrados en ${pass} lote(s). Último lote: ${batchSize}.`,
      );
      logger.debug(`Hybrid last result ${JSON.stringify(lastResult)}`);
    } else if (options.blockAccounts) {
      await waitForInstagramLogin(page, options.loginTimeout);
      const accounts = parseAccountsFile(options.accountsFile);
      const result = await blockAccounts(page, accounts, translations, {
        accountDelay: options.blockDelay,
        confirmDelay: options.confirmDelay,
        limit: options.blockLimit,
        dryRun: options.blockDryRun,
        ledgerPath: path.join(rootDirectory, '.state/block-ledger.jsonl'),
        failuresPath: path.join(rootDirectory, '.state/block-failures.json'),
      });

      logger.info(
        `Block summary: ${result.blocked} blocked, ${result.alreadyBlocked} already blocked, ${result.wouldBlock} would block, ${result.skipped} skipped, ${result.notFound} not found, ${result.failed} failed.`,
      );
    } else {
      const jobs = createCleanupJobs(page, targets);
      keepBrowserOpen = await runCleanupLoop(page, jobs, translations, options);
    }

    if (keepBrowserOpen) {
      if (options.notifyDone) {
        notifyCleanupDone(
          getTranslationValues(translations, ['doneNotification'])[0] ?? 'Cleanup finished.',
        );
      }

      if (options.closeOnFinish) {
        await browserLifecycle.close('cleanup finished');
        logger.info('Chrome closed after the cleanup finished.');
      } else {
        logger.info('Chrome stays open for verification. Close the window when you are finished.');
      }
    } else {
      await browserLifecycle.close('program stopped before completion');
    }
  } catch (error) {
    await browserLifecycle.close('uncaught error');
    throw error;
  } finally {
    browserLifecycle.uninstall();
  }
}

main().catch((error: unknown) => {
  logger.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
