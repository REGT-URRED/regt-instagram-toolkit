import { waitForPageIdle } from '../../browser/waits.js';
import { clickByLabels } from '../clickByLabels.js';
import type { CleanupContext } from './CleanupContext.js';
import { NetworkVerifier } from './NetworkVerifier.js';
import { ToastVerifier } from './ToastVerifier.js';

const toastTimeoutPerSelectedItem = 350;
const maxToastTimeout = 90_000;
const confirmationDialogCloseTimeoutMs = 15_000;
const errorDialogRecoveryTimeoutMs = 120_000;

export type BatchActionResult =
  | { status: 'confirmed'; count: number | null }
  | { status: 'unverified' }
  | { status: 'recovered-error-dialog' };

export class BatchActionRunner {
  private readonly networkVerifier: NetworkVerifier;
  private readonly toastVerifier: ToastVerifier;

  public constructor(private readonly context: CleanupContext) {
    this.networkVerifier = new NetworkVerifier(context);
    this.toastVerifier = new ToastVerifier(context);
  }

  public async run(): Promise<BatchActionResult> {
    const previousToasts = await this.toastVerifier.collectExistingTexts();
    const mutationRequest = this.networkVerifier.waitForMutation();
    const toastRequest = this.toastVerifier.waitForNewToast(previousToasts, this.getToastTimeout());

    // Instagram's activity center ignores synthetic element.click() calls for
    // the bulk action bar, so the click is dispatched as a real mouse event.
    const actionClicked = await clickByLabels(this.context.page, this.context.target.actionLabels, {
      timeout: 8000,
      preferLast: true,
      useMouseClick: true,
      debugName: this.context.target.actionLabels.join(' / '),
    });

    if (!actionClicked) {
      throw new Error('The cleanup action button was not found. No manual fallback was attempted.');
    }

    await this.delay(this.randomConfirmDelay());

    // Bulk actions may open a confirmation sheet, while a single item is
    // applied directly. The dialog is only required when it actually appears.
    const hadConfirmationDialog = await this.confirmIfDialogAppeared();

    const actionResult = await Promise.race([
      toastRequest.then((toastResult) => ({ type: 'toast' as const, toastResult })),
      this.waitForInstagramErrorDialog(errorDialogRecoveryTimeoutMs).then((found) => ({
        type: 'error-dialog' as const,
        found,
      })),
    ]);

    if (actionResult.type === 'error-dialog' && actionResult.found) {
      await this.dismissInstagramErrorDialog();
      return { status: 'recovered-error-dialog' };
    }

    const toastResult = actionResult.type === 'toast' ? actionResult.toastResult : null;
    if (toastResult) {
      this.context.debug(`Instagram confirmed cleanup: ${toastResult.text}`);
    } else {
      this.context.warn('No Instagram cleanup toast was detected after confirmation.');
      if (await this.waitForInstagramErrorDialog(this.context.options.errorDialogTimeoutMs)) {
        await this.dismissInstagramErrorDialog();
        return { status: 'recovered-error-dialog' };
      }

      const mutation = await mutationRequest;
      this.networkVerifier.ensureMutationSucceeded(mutation);
      if (!mutation) {
        this.context.warn(
          'Instagram did not confirm the cleanup through a toast or a network response. The batch will be verified against the activity list instead of being counted as done.',
        );
        await waitForPageIdle(this.context.page, 8_000, 750);
        return { status: 'unverified' };
      }
    }

    if (hadConfirmationDialog) {
      this.context.debug('Instagram cleanup confirmation dialog was accepted.');
    }

    await waitForPageIdle(this.context.page, 8_000, 750);
    return { status: 'confirmed', count: toastResult?.count ?? null };
  }

  private async confirmIfDialogAppeared(): Promise<boolean> {
    const labels = this.context.target.confirmLabels.map((label) => this.normalize(label));
    const appeared = await this.context.page
      .waitForFunction(
        (confirmationLabels: string[]) => {
          const normalize = (value: unknown): string =>
            String(value ?? '')
              .normalize('NFKD')
              .replace(/[\u0300-\u036f]/g, '')
              .replace(/[\u2019\u2018\u0060]/g, "'")
              .replace(/\s+/g, ' ')
              .trim()
              .toLowerCase();
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

          return Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"]'))
            .filter((element) => isVisible(element))
            .some((dialog) => {
              const text = normalize(dialog.textContent ?? '');
              return confirmationLabels.some((label) => label && text.includes(label));
            });
        },
        { timeout: 3_000, polling: 150 },
        labels,
      )
      .then(async (handle) => {
        await handle.dispose();
        return true;
      })
      .catch(() => false);

    if (!appeared) {
      this.context.debug(
        'No confirmation dialog appeared; Instagram applied the action directly.',
      );
      return false;
    }

    const confirmed = await clickByLabels(this.context.page, this.context.target.confirmLabels, {
      timeout: 8_000,
      preferLast: true,
      insideDialog: true,
      useMouseClick: true,
      debugName: `Confirmation ${this.context.target.confirmLabels.join(' / ')}`,
    });

    if (!confirmed) {
      throw new Error(
        'Instagram asked to confirm the cleanup but the confirmation button could not be clicked.',
      );
    }

    await this.waitForConfirmationDialogToClose();
    return true;
  }

  private randomConfirmDelay(): number {
    const { min, max } = this.context.options.confirmDelay;
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  private getToastTimeout(): number {
    return Math.min(
      maxToastTimeout,
      this.context.options.toastTimeoutMs +
        this.context.currentSelection.count * toastTimeoutPerSelectedItem,
    );
  }

  private async waitForConfirmationDialogToClose(): Promise<void> {
    const labels = this.context.target.confirmLabels.map((label) => this.normalize(label));

    try {
      await this.context.page.waitForFunction(
        (confirmationLabels: string[]) => {
          const normalize = (value: unknown): string =>
            String(value ?? '')
              .normalize('NFKD')
              .replace(/[\u0300-\u036f]/g, '')
              .replace(/[’‘`]/g, "'")
              .replace(/\s+/g, ' ')
              .trim()
              .toLowerCase();
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
          const dialogs = Array.from(
            document.querySelectorAll('[role="dialog"], [aria-modal="true"]'),
          ).filter((element) => isVisible(element));

          return !dialogs.some((dialog) => {
            const text = normalize(dialog.textContent ?? '');
            return confirmationLabels.some((label) => label && text.includes(label));
          });
        },
        { timeout: confirmationDialogCloseTimeoutMs, polling: 250 },
        labels,
      );
    } catch {
      throw new Error('The cleanup confirmation dialog stayed open after clicking confirm.');
    }
  }

  private async waitForInstagramErrorDialog(timeout: number): Promise<boolean> {
    return this.context.page
      .waitForFunction(
        () => {
          const normalize = (value: unknown): string =>
            String(value ?? '')
              .normalize('NFKD')
              .replace(/[\u0300-\u036f]/g, '')
              .replace(/[’‘`]/g, "'")
              .replace(/\s+/g, ' ')
              .trim()
              .toLowerCase();
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
          const errorTexts = [
            'se produjo un error',
            'hubo un problema',
            'algo salio mal',
            'algo ha salido mal',
            'intenta de nuevo',
            'intentalo de nuevo',
            "une erreur s'est produite",
            'une erreur est survenue',
            'something went wrong',
            'an error occurred',
            'try again later',
          ];

          return Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"]'))
            .filter((element) => isVisible(element))
            .some((dialog) => {
              const text = normalize(dialog.textContent ?? '');
              return errorTexts.some((errorText) => text.includes(errorText));
            });
        },
        { timeout, polling: 250 },
      )
      .then(async (handle) => {
        await handle.dispose();
        return true;
      })
      .catch(() => false);
  }

  private async dismissInstagramErrorDialog(): Promise<void> {
    const dialogText = await this.context.page
      .evaluate(() =>
        Array.from(document.querySelectorAll('[role="dialog"],[aria-modal="true"]'))
          .map((dialog) => (dialog as HTMLElement).innerText.replace(/\s+/g, ' ').trim())
          .filter(Boolean)
          .join(' | ')
          .slice(0, 400),
      )
      .catch(() => '');
    if (dialogText) {
      this.context.warn(`Instagram error dialog text: ${dialogText}`);
    }

    const dismissed = await clickByLabels(
      this.context.page,
      ['Aceptar', 'ACEPTAR', 'Entendido', 'OK', 'Ok', "D'accord", 'D’accord'],
      {
        timeout: 5_000,
        exact: true,
        insideDialog: true,
        debugName: 'Instagram error dialog dismiss',
      },
    );
    if (!dismissed) {
      this.context.warn('Could not find the Instagram error dialog dismiss button.');
    }
  }



  private normalize(value: unknown): string {
    return String(value ?? '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[’‘`]/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private delay(durationMs: number): Promise<void> {
    return new Promise((resolve) => {
      globalThis.setTimeout(resolve, durationMs);
    });
  }
}
