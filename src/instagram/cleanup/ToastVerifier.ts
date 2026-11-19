import type { CleanupContext } from './CleanupContext.js';
import { collectExistingCleanupToasts } from './browser/collectExistingCleanupToasts.js';
import { findNewCleanupToast } from './browser/findNewCleanupToast.js';
import type { CleanupToastResult } from './types.js';
import { getTranslationValues } from '../../translations/loadTranslations.js';
import type { CleanupMode } from '../../types.js';

const cleanupToastTranslationKeys: Record<CleanupMode, string[]> = {
  likes: ['likesCleanupToast'],
  comments: ['commentsCleanupToast'],
};

// Instagram reworded the likes toast: it now says "Indicaste que no te gustan
// N publicaciones" instead of "Ya no te gusta N publicacion". These variants
// are always merged in so a translation file never makes the toast invisible.
const builtinToastTemplates: Record<CleanupMode, string[]> = {
  likes: [
    'Indicaste que no te gustan {{count}} publicaciones',
    'Indicaste que no te gusta {{count}} publicaci\u00f3n',
    'Has indicado que no te gustan {{count}} publicaciones',
    'Has indicado que no te gusta {{count}} publicaci\u00f3n',
    "You indicated you don't like {{count}} posts",
    "You indicated you don't like {{count}} post",
    'You no longer like {{count}} posts',
    'You no longer like {{count}} post',
    "Vous avez indiqu\u00e9 que vous n'aimez pas {{count}} publications",
    "Vous avez indiqu\u00e9 que vous n'aimez pas {{count}} publication",
  ],
  comments: [],
};

export class ToastVerifier {
  public constructor(private readonly context: CleanupContext) {}

  public async collectExistingTexts(): Promise<string[]> {
    return this.context.page.evaluate(collectExistingCleanupToasts, {
      templates: this.toastTemplates,
    });
  }

  public async waitForNewToast(
    ignoredTexts: string[],
    timeout = 12_000,
  ): Promise<CleanupToastResult | null> {
    try {
      const handle = await this.waitForToastHandle(ignoredTexts, timeout);
      const result = await handle.jsonValue();
      await handle.dispose();
      this.context.lastToast = result;
      return result;
    } catch {
      return null;
    }
  }

  private async waitForToastHandle(ignoredTexts: string[], timeout: number) {
    return this.context.page.waitForFunction(
      findNewCleanupToast,
      { timeout, polling: 100 },
      { ignored: ignoredTexts, templates: this.toastTemplates },
    );
  }

  private get toastTemplates(): string[] {
    const mode = this.context.target.mode;
    return Array.from(
      new Set([
        ...getTranslationValues(this.context.translations, cleanupToastTranslationKeys[mode]),
        ...builtinToastTemplates[mode],
      ]),
    );
  }
}
