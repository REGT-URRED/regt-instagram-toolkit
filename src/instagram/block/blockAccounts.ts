import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Page } from 'puppeteer-core';
import { waitForDomReady, waitForPageIdle } from '../../browser/waits.js';
import { logger } from '../../utils/logger.js';
import type { BlockAccountEntry, BlockAccountsOptions, BlockAccountsResult } from '../../types.js';
import { getTranslationValues } from '../../translations/loadTranslations.js';
import { clickByLabels } from '../clickByLabels.js';

const profileStateProbe = () => {
  const bodyText = (document.body.innerText || '').normalize('NFKD').toLowerCase();
  return {
    notFound:
      /lo sentimos|sorry, this page|this page isn't available|la pagina no esta disponible/.test(
        bodyText.replace(/[\u0300-\u036f]/g, ''),
      ),
    blocked: bodyText.includes('desbloquear') || bodyText.includes('unblock'),
  };
};

export async function blockAccounts(
  page: Page,
  accounts: BlockAccountEntry[],
  translations: Record<string, string | string[]>,
  options: BlockAccountsOptions,
): Promise<BlockAccountsResult> {
  const result: BlockAccountsResult = {
    blocked: 0,
    alreadyBlocked: 0,
    notFound: 0,
    failed: 0,
    wouldBlock: 0,
    skipped: 0,
  };
  const optionsLabels = getTranslationValues(translations, ['options']);
  const blockLabels = getTranslationValues(translations, ['block']);
  const unblockLabels = getTranslationValues(translations, ['unblock']);
  const ledger = loadBlockLedger(options.ledgerPath);
  const failures: Array<{ username: string; error: string }> = [];
  let processed = 0;

  for (const account of accounts) {
    const username = account.username.replace(/^@/, '').trim();
    if (!username) {
      continue;
    }

    if (options.limit && processed >= options.limit) {
      logger.info(`[block] Limit reached: ${options.limit}`);
      break;
    }

    const previous = ledger.get(username);
    if (!options.dryRun && (previous === 'blocked' || previous === 'alreadyBlocked')) {
      result.skipped += 1;
      continue;
    }

    processed += 1;
    const counter = `${processed}/${accounts.length}`;
    options.onPhase?.('select', `@${username}`, `${result.blocked} bloqueadas · ${counter}`);
    try {
      await page.goto(`https://www.instagram.com/${encodeURIComponent(username)}/`, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      });
      await waitForDomReady(page);
      await waitForPageIdle(page, 2_500, 500);

      const throttled = await page.evaluate(() => {
        const text = (document.body.innerText || '').toLowerCase();
        return (
          text.includes('try again later') ||
          text.includes('intenta de nuevo') ||
          text.includes('temporarily blocked') ||
          text.includes('accion bloqueada')
        );
      });
      if (throttled) {
        throw new Error('Instagram asked to try again later; stopping to protect the account.');
      }

      const state = await page.evaluate(profileStateProbe);
      if (state.notFound) {
        result.notFound += 1;
        recordBlock(ledger, options.ledgerPath, username, 'notFound');
        logger.warn(`[${counter}] @${username}: no existe`);
        continue;
      }
      if (state.blocked) {
        result.alreadyBlocked += 1;
        recordBlock(ledger, options.ledgerPath, username, 'alreadyBlocked');
        logger.info(`[${counter}] @${username}: ya bloqueada`);
        continue;
      }
      if (options.dryRun) {
        result.wouldBlock += 1;
        logger.info(`[${counter}] @${username}: se bloquearía`);
        continue;
      }

      options.onPhase?.('confirm', `bloqueando @${username}`, `${result.blocked} bloqueadas · ${counter}`);
      const opened = await clickByLabels(page, optionsLabels, {
        timeout: 6_000,
        debugName: 'Profile options',
      });
      if (!opened) {
        throw new Error('The profile options button was not found.');
      }

      await randomDelay(options.confirmDelay);

      const selectedBlock = await clickByLabels(page, blockLabels, {
        timeout: 6_000,
        preferLast: true,
        insideDialog: true,
        debugName: 'Block menu item',
      });
      if (!selectedBlock) {
        throw new Error('The Block menu item was not found.');
      }

      await randomDelay(options.confirmDelay);

      const confirmed = await clickByLabels(page, blockLabels, {
        timeout: 6_000,
        preferLast: true,
        insideDialog: true,
        debugName: 'Block confirmation',
      });
      if (!confirmed) {
        throw new Error('The Block confirmation button was not found.');
      }

      await waitForBlockedState(page, unblockLabels);
      result.blocked += 1;
      recordBlock(ledger, options.ledgerPath, username, 'blocked');
      options.onPhase?.('done', `@${username} bloqueada`, `${result.blocked} bloqueadas · ${counter}`);
      logger.info(`[${counter}] @${username}: bloqueada`);
    } catch (error) {
      result.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      options.onPhase?.('error', `@${username} falló`, `${result.failed} fallos · ${counter}`);
      failures.push({ username, error: message });
      recordBlock(ledger, options.ledgerPath, username, 'failed');
      logger.error(`[${counter}] @${username}: fallo (${message})`);
      if (message.includes('try again later')) {
        logger.warn('[block] Stopping the run after a throttle signal.');
        break;
      }
    }

    await randomDelay(options.accountDelay);
  }

  if (options.failuresPath) {
    fs.mkdirSync(path.dirname(options.failuresPath), { recursive: true });
    fs.writeFileSync(options.failuresPath, `${JSON.stringify(failures, null, 2)}\n`);
  }

  return result;
}

function loadBlockLedger(filePath?: string): Map<string, string> {
  const ledger = new Map<string, string>();
  if (!filePath || !fs.existsSync(filePath)) {
    return ledger;
  }

  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    try {
      const entry = JSON.parse(line) as { username?: string; status?: string };
      if (entry.username && entry.status) {
        ledger.set(entry.username, entry.status);
      }
    } catch {
      // ignore malformed lines
    }
  }

  return ledger;
}

function recordBlock(
  ledger: Map<string, string>,
  filePath: string | undefined,
  username: string,
  status: string,
): void {
  ledger.set(username, status);
  if (!filePath) {
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(
    filePath,
    `${JSON.stringify({ username, status, at: new Date().toISOString() })}\n`,
  );
}

async function waitForBlockedState(page: Page, unblockLabels: string[]): Promise<void> {
  const normalizedLabels = unblockLabels.map((label) =>
    label
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase(),
  );

  await page.waitForFunction(
    (labels: string[]) => {
      const text = (document.body.innerText || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
      return labels.some((label) => label && text.includes(label));
    },
    { timeout: 10_000, polling: 250 },
    normalizedLabels,
  );
}

async function randomDelay(range: { min: number; max: number }): Promise<void> {
  const min = Math.max(0, Math.floor(range.min));
  const max = Math.max(min, Math.floor(range.max));
  const duration = min + Math.floor(Math.random() * (max - min + 1));
  await sleep(duration);
}
