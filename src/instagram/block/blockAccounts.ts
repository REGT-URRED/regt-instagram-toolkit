import { setTimeout as sleep } from 'node:timers/promises';
import type { Page } from 'puppeteer';
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
  };
  const optionsLabels = getTranslationValues(translations, ['options']);
  const blockLabels = getTranslationValues(translations, ['block']);
  const unblockLabels = getTranslationValues(translations, ['unblock']);

  for (const account of accounts) {
    const username = account.username.replace(/^@/, '').trim();
    if (!username) {
      continue;
    }

    logger.info(`[block] @${username}`);
    try {
      await page.goto(`https://www.instagram.com/${encodeURIComponent(username)}/`, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      });
      await waitForDomReady(page);
      await waitForPageIdle(page, 2_500, 500);

      const state = await page.evaluate(profileStateProbe);
      if (state.notFound) {
        result.notFound += 1;
        logger.warn(`[block] @${username} was not found. Skipping.`);
        continue;
      }
      if (state.blocked) {
        result.alreadyBlocked += 1;
        logger.info(`[block] @${username} was already blocked. Skipping.`);
        continue;
      }

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
      logger.info(`[block] @${username} blocked.`);
    } catch (error) {
      result.failed += 1;
      logger.error(
        `[block] @${username} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    await randomDelay(options.accountDelay);
  }

  return result;
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
