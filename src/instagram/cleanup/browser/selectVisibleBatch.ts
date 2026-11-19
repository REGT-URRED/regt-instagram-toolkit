import type { SelectionResult } from '../types.js';

export interface SelectionTarget {
  key: string;
}

export interface SelectVisibleBatchInput {
  checkboxSelector: string;
  controlText: string[];
  ignoredKeys?: string[];
  skipLeadingCount?: number;
}

export interface SelectionTargetInput {
  checkboxSelector: string;
  controlText?: string[];
  key: string;
}

export interface SelectionResultInput {
  attemptedCount: number;
  checkboxSelector: string;
}

export function collectNextVisibleBatchTarget({
  checkboxSelector,
  controlText,
  ignoredKeys = [],
  skipLeadingCount = 0,
}: SelectVisibleBatchInput): SelectionTarget | null {
  class VisibleBatchTargetCollector {
    private readonly ignored = new Set(ignoredKeys);

    public collect(): SelectionTarget | null {
      const candidates = this.findCandidates();
      const candidate = candidates[Math.min(Math.max(0, skipLeadingCount), candidates.length)];

      if (!candidate) {
        return null;
      }

      return { key: this.getCandidateKey(candidate) };
    }

    private findCandidates(): Element[] {
      const sortedCandidates = Array.from(document.querySelectorAll(checkboxSelector))
        .filter((element) => this.isSelectableCandidate(element))
        .sort((firstElement, secondElement) => this.comparePosition(firstElement, secondElement));

      return this.uniqueByItem(sortedCandidates);
    }

    private isSelectableCandidate(element: Element): boolean {
      return (
        this.getItemSignature(element) !== null &&
        !this.ignored.has(this.getCandidateKey(element)) &&
        this.isVisible(element) &&
        this.isInMainViewport(element) &&
        this.isCheckboxCandidate(element) &&
        !this.isNavigationCandidate(element) &&
        !this.isControl(element) &&
        !this.isChecked(element)
      );
    }

    private isVisible(element: Element): boolean {
      if (element.closest('[aria-hidden="true"]')) {
        return false;
      }
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return (
        rect.width >= 8 &&
        rect.height >= 8 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none'
      );
    }

    private isInMainViewport(element: Element): boolean {
      const rect = element.getBoundingClientRect();
      return (
        rect.top > 90 &&
        rect.bottom < window.innerHeight - 20 &&
        rect.left > 0 &&
        rect.right < window.innerWidth
      );
    }

    private isControl(element: Element): boolean {
      const text = this.normalize(element.textContent || element.getAttribute('aria-label') || '');
      return controlText.some((word) => word && text.includes(word));
    }

    private isNavigationCandidate(element: Element): boolean {
      const link = element.closest('a[href]');
      const href = link?.getAttribute('href') ?? '';
      return (
        href.includes('facebook.com/help') ||
        href.includes('/help/') ||
        href.includes('/web/lite') ||
        href.includes('/p/') ||
        href.includes('/reel/')
      );
    }

    private isCheckboxCandidate(element: Element): boolean {
      if (element instanceof HTMLInputElement) {
        return element.type === 'checkbox' && !element.checked;
      }

      if (!this.looksLikeCheckboxControl(element)) {
        return false;
      }

      const ariaLabel = this.normalize(element.getAttribute('aria-label'));
      const role = this.normalize(element.getAttribute('role'));
      const testId = this.normalize(element.getAttribute('data-testid'));

      return (
        testId === 'bulk_action_checkbox' ||
        ariaLabel.includes('toggle checkbox') ||
        ariaLabel.includes('checkbox') ||
        role === 'checkbox' ||
        element.hasAttribute('aria-checked')
      );
    }

    private looksLikeCheckboxControl(element: Element): boolean {
      const rect = element.getBoundingClientRect();
      const longestSide = Math.max(rect.width, rect.height);
      const shortestSide = Math.min(rect.width, rect.height);

      if (longestSide > 96) {
        return false;
      }

      return shortestSide >= 8 && longestSide / shortestSide <= 3;
    }

    private isChecked(element: Element): boolean {
      if (element instanceof HTMLInputElement) {
        return element.checked;
      }

      return [element, ...Array.from(element.querySelectorAll('*'))].some((node) => {
        if (node.getAttribute('aria-checked') === 'true') {
          return true;
        }

        if (!(node instanceof HTMLElement)) {
          return false;
        }

        const style = window.getComputedStyle(node);
        const mask = style.maskImage || style.webkitMaskImage || '';
        const background = style.backgroundImage || '';
        const source = node.getAttribute('src') ?? node.getAttribute('href') ?? '';
        const signature = this.normalize([mask, background, source].join(' '));

        return signature.includes('circle-check') || signature.includes('check__filled');
      });
    }

    private uniqueByItem(elements: Element[]): Element[] {
      const seen = new Set<string>();

      return elements.filter((element) => {
        const key = this.getCandidateKey(element);
        if (seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      });
    }

    private getCandidateKey(element: Element): string {
      const signature = this.getItemSignature(element);
      if (signature) {
        return `item:${signature}`;
      }

      const rect = element.getBoundingClientRect();
      const centerX = Math.round((rect.left + rect.width / 2) / 16);
      const centerY = Math.round((rect.top + rect.height / 2) / 16);
      return `point:${centerX}:${centerY}`;
    }

    private getItemSignature(element: Element): string | null {
      let current: Element | null = element;

      for (let depth = 0; current && depth < 12; depth += 1) {
        const directMediaId =
          current.getAttribute('media_id') ??
          current.getAttribute('data-media-id') ??
          current.getAttribute('data-id');
        if (directMediaId) {
          return `id:${directMediaId}`;
        }

        const link = current.querySelector<HTMLAnchorElement>('a[href*="/p/"], a[href*="/reel/"]');
        if (link?.href) {
          const stable = this.stableUrlPart(link.href);
          if (stable) {
            return `href:${stable}`;
          }
        }

        const image = current.querySelector<HTMLImageElement>('img[src], img[currentSrc]');
        const imageSource = image?.currentSrc || image?.src || '';
        if (imageSource && !this.isProfileAvatarUrl(imageSource)) {
          const stable = this.stableUrlPart(imageSource);
          if (stable) {
            return `image:${stable}`;
          }
        }

        current = current.parentElement;
      }

      return this.textPositionSignature(element);
    }

    private isProfileAvatarUrl(value: string): boolean {
      return /\/t51\.[^/]+-19\//.test(value);
    }

    private textPositionSignature(element: Element): string | null {
      let current: Element | null = element;

      for (let depth = 0; current && depth < 12; depth += 1) {
        const ariaLabel = current.getAttribute('aria-label');
        if (ariaLabel && !/casilla|checkbox|seleccionar/i.test(ariaLabel)) {
          const normalizedLabel = this.normalize(ariaLabel).slice(0, 120);
          if (normalizedLabel) {
            return `aria:${normalizedLabel}`;
          }
        }
        current = current.parentElement;
      }

      const text = this.normalize(
        element.closest('div')?.textContent ?? element.textContent ?? '',
      ).slice(0, 120);

      return text ? `text:${text}` : null;
    }

    private stableUrlPart(value: string): string | null {
      if (!value) {
        return null;
      }

      try {
        const url = new URL(value, window.location.origin);
        const cacheKey = url.searchParams.get('ig_cache_key');
        if (cacheKey) {
          return `ig_cache_key:${cacheKey}`;
        }
        return `${url.hostname}${url.pathname}`;
      } catch {
        return value.split('?')[0] ?? null;
      }
    }

    private comparePosition(firstElement: Element, secondElement: Element): number {
      const first = firstElement.getBoundingClientRect();
      const second = secondElement.getBoundingClientRect();
      return first.top - second.top || first.left - second.left;
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
  }

  return new VisibleBatchTargetCollector().collect();
}

export function clickSelectionTargetByKey({
  checkboxSelector,
  controlText = [],
  key,
}: SelectionTargetInput): boolean {
  class SelectionTargetClicker {
    public click(): boolean {
      const element = this.findElementByKey();

      if (!element) {
        return false;
      }

      const clickableElement = this.findClickableCheckboxElement(element);

      if (!clickableElement) {
        return false;
      }

      clickableElement.click();
      return true;
    }

    private findElementByKey(): Element | null {
      return (
        Array.from(document.querySelectorAll(checkboxSelector))
          .filter((element) => !this.isControl(element))
          .filter((element) => !this.isNavigationCandidate(element))
          .find((element) => this.getCandidateKey(element) === key) ?? null
      );
    }

    private findClickableCheckboxElement(element: Element): HTMLElement | null {
      const candidates = [
        element,
        ...Array.from(element.querySelectorAll<HTMLElement>(checkboxSelector)),
      ]
        .filter((candidate): candidate is HTMLElement => candidate instanceof HTMLElement)
        .filter((candidate) => this.isVisible(candidate))
        .filter((candidate) => this.isCheckboxCandidate(candidate))
        .filter((candidate) => !this.isControl(candidate))
        .filter((candidate) => !this.isNavigationCandidate(candidate))
        .filter((candidate) => !this.isChecked(candidate))
        .sort((first, second) => this.checkboxScore(first) - this.checkboxScore(second));

      return candidates[0] ?? null;
    }

    private isVisible(element: Element): boolean {
      if (element.closest('[aria-hidden="true"]')) {
        return false;
      }
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return (
        rect.width >= 8 &&
        rect.height >= 8 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none'
      );
    }

    private isCheckboxCandidate(element: Element): boolean {
      if (element instanceof HTMLInputElement) {
        return element.type === 'checkbox' && !element.checked;
      }

      if (!this.looksLikeCheckboxControl(element)) {
        return false;
      }

      const ariaLabel = this.normalize(element.getAttribute('aria-label'));
      const role = this.normalize(element.getAttribute('role'));
      const testId = this.normalize(element.getAttribute('data-testid'));

      return (
        testId === 'bulk_action_checkbox' ||
        ariaLabel.includes('toggle checkbox') ||
        ariaLabel.includes('checkbox') ||
        role === 'checkbox' ||
        element.hasAttribute('aria-checked')
      );
    }

    private isControl(element: Element): boolean {
      const text = this.normalize(element.textContent || element.getAttribute('aria-label') || '');
      return controlText.some((word) => word && text.includes(word));
    }

    private isNavigationCandidate(element: Element): boolean {
      const link = element.closest('a[href]');
      const href = link?.getAttribute('href') ?? '';
      return (
        href.includes('facebook.com/help') ||
        href.includes('/help/') ||
        href.includes('/web/lite') ||
        href.includes('/p/') ||
        href.includes('/reel/')
      );
    }

    private looksLikeCheckboxControl(element: Element): boolean {
      const rect = element.getBoundingClientRect();
      const longestSide = Math.max(rect.width, rect.height);
      const shortestSide = Math.min(rect.width, rect.height);

      if (longestSide > 96) {
        return false;
      }

      return shortestSide >= 8 && longestSide / shortestSide <= 3;
    }

    private checkboxScore(element: Element): number {
      const rect = element.getBoundingClientRect();
      const testId = this.normalize(element.getAttribute('data-testid'));
      const role = this.normalize(element.getAttribute('role'));
      const exactMatchBonus =
        testId === 'bulk_action_checkbox' || role === 'checkbox' ? -10_000 : 0;

      return exactMatchBonus + rect.width * rect.height;
    }

    private isChecked(element: Element): boolean {
      if (element instanceof HTMLInputElement) {
        return element.checked;
      }

      return [element, ...Array.from(element.querySelectorAll('*'))].some((node) => {
        if (node.getAttribute('aria-checked') === 'true') {
          return true;
        }

        if (!(node instanceof HTMLElement)) {
          return false;
        }

        const style = window.getComputedStyle(node);
        const mask = style.maskImage || style.webkitMaskImage || '';
        const background = style.backgroundImage || '';
        const source = node.getAttribute('src') ?? node.getAttribute('href') ?? '';
        const signature = this.normalize([mask, background, source].join(' '));

        return signature.includes('circle-check') || signature.includes('check__filled');
      });
    }

    private uniqueByItem(elements: Element[]): Element[] {
      const seen = new Set<string>();

      return elements.filter((element) => {
        const key = this.getCandidateKey(element);
        if (seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      });
    }

    private getCandidateKey(element: Element): string {
      const signature = this.getItemSignature(element);
      if (signature) {
        return `item:${signature}`;
      }

      const rect = element.getBoundingClientRect();
      const centerX = Math.round((rect.left + rect.width / 2) / 16);
      const centerY = Math.round((rect.top + rect.height / 2) / 16);
      return `point:${centerX}:${centerY}`;
    }

    private getItemSignature(element: Element): string | null {
      let current: Element | null = element;

      for (let depth = 0; current && depth < 12; depth += 1) {
        const directMediaId =
          current.getAttribute('media_id') ??
          current.getAttribute('data-media-id') ??
          current.getAttribute('data-id');
        if (directMediaId) {
          return `id:${directMediaId}`;
        }

        const link = current.querySelector<HTMLAnchorElement>('a[href*="/p/"], a[href*="/reel/"]');
        if (link?.href) {
          const stable = this.stableUrlPart(link.href);
          if (stable) {
            return `href:${stable}`;
          }
        }

        const image = current.querySelector<HTMLImageElement>('img[src], img[currentSrc]');
        const imageSource = image?.currentSrc || image?.src || '';
        if (imageSource && !this.isProfileAvatarUrl(imageSource)) {
          const stable = this.stableUrlPart(imageSource);
          if (stable) {
            return `image:${stable}`;
          }
        }

        current = current.parentElement;
      }

      return this.textPositionSignature(element);
    }

    private isProfileAvatarUrl(value: string): boolean {
      return /\/t51\.[^/]+-19\//.test(value);
    }

    private textPositionSignature(element: Element): string | null {
      let current: Element | null = element;

      for (let depth = 0; current && depth < 12; depth += 1) {
        const ariaLabel = current.getAttribute('aria-label');
        if (ariaLabel && !/casilla|checkbox|seleccionar/i.test(ariaLabel)) {
          const normalizedLabel = this.normalize(ariaLabel).slice(0, 120);
          if (normalizedLabel) {
            return `aria:${normalizedLabel}`;
          }
        }
        current = current.parentElement;
      }

      const text = this.normalize(
        element.closest('div')?.textContent ?? element.textContent ?? '',
      ).slice(0, 120);

      return text ? `text:${text}` : null;
    }

    private stableUrlPart(value: string): string | null {
      if (!value) {
        return null;
      }

      try {
        const url = new URL(value, window.location.origin);
        const cacheKey = url.searchParams.get('ig_cache_key');
        if (cacheKey) {
          return `ig_cache_key:${cacheKey}`;
        }
        return `${url.hostname}${url.pathname}`;
      } catch {
        return value.split('?')[0] ?? null;
      }
    }

    private comparePosition(firstElement: Element, secondElement: Element): number {
      const first = firstElement.getBoundingClientRect();
      const second = secondElement.getBoundingClientRect();
      return first.top - second.top || first.left - second.left;
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
  }

  return new SelectionTargetClicker().click();
}

export function isSelectionTargetChecked({
  checkboxSelector,
  controlText = [],
  key,
}: SelectionTargetInput): boolean {
  class SelectionTargetCheck {
    public isChecked(): boolean {
      const element = this.findElementByKey();
      return Boolean(element && this.isElementChecked(element));
    }

    private findElementByKey(): Element | null {
      return (
        Array.from(document.querySelectorAll(checkboxSelector))
          .filter((element) => !this.isControl(element))
          .filter((element) => !this.isNavigationCandidate(element))
          .find((element) => this.getCandidateKey(element) === key) ?? null
      );
    }

    private isElementChecked(element: Element): boolean {
      if (element instanceof HTMLInputElement) {
        return element.checked;
      }

      return [element, ...Array.from(element.querySelectorAll('*'))].some((node) => {
        if (node.getAttribute('aria-checked') === 'true') {
          return true;
        }

        if (!(node instanceof HTMLElement)) {
          return false;
        }

        const style = window.getComputedStyle(node);
        const mask = style.maskImage || style.webkitMaskImage || '';
        const background = style.backgroundImage || '';
        const source = node.getAttribute('src') ?? node.getAttribute('href') ?? '';
        const signature = this.normalize([mask, background, source].join(' '));

        return signature.includes('circle-check') || signature.includes('check__filled');
      });
    }

    private isControl(element: Element): boolean {
      const text = this.normalize(element.textContent || element.getAttribute('aria-label') || '');
      return controlText.some((word) => word && text.includes(word));
    }

    private isNavigationCandidate(element: Element): boolean {
      const link = element.closest('a[href]');
      const href = link?.getAttribute('href') ?? '';
      return (
        href.includes('facebook.com/help') ||
        href.includes('/help/') ||
        href.includes('/web/lite') ||
        href.includes('/p/') ||
        href.includes('/reel/')
      );
    }

    private getCandidateKey(element: Element): string {
      const signature = this.getItemSignature(element);
      if (signature) {
        return `item:${signature}`;
      }

      const rect = element.getBoundingClientRect();
      const centerX = Math.round((rect.left + rect.width / 2) / 16);
      const centerY = Math.round((rect.top + rect.height / 2) / 16);
      return `point:${centerX}:${centerY}`;
    }

    private getItemSignature(element: Element): string | null {
      let current: Element | null = element;

      for (let depth = 0; current && depth < 12; depth += 1) {
        const directMediaId =
          current.getAttribute('media_id') ??
          current.getAttribute('data-media-id') ??
          current.getAttribute('data-id');
        if (directMediaId) {
          return `id:${directMediaId}`;
        }

        const link = current.querySelector<HTMLAnchorElement>('a[href*="/p/"], a[href*="/reel/"]');
        if (link?.href) {
          const stable = this.stableUrlPart(link.href);
          if (stable) {
            return `href:${stable}`;
          }
        }

        const image = current.querySelector<HTMLImageElement>('img[src], img[currentSrc]');
        const imageSource = image?.currentSrc || image?.src || '';
        if (imageSource && !this.isProfileAvatarUrl(imageSource)) {
          const stable = this.stableUrlPart(imageSource);
          if (stable) {
            return `image:${stable}`;
          }
        }

        current = current.parentElement;
      }

      return this.textPositionSignature(element);
    }

    private isProfileAvatarUrl(value: string): boolean {
      return /\/t51\.[^/]+-19\//.test(value);
    }

    private textPositionSignature(element: Element): string | null {
      let current: Element | null = element;

      for (let depth = 0; current && depth < 12; depth += 1) {
        const ariaLabel = current.getAttribute('aria-label');
        if (ariaLabel && !/casilla|checkbox|seleccionar/i.test(ariaLabel)) {
          const normalizedLabel = this.normalize(ariaLabel).slice(0, 120);
          if (normalizedLabel) {
            return `aria:${normalizedLabel}`;
          }
        }
        current = current.parentElement;
      }

      const text = this.normalize(
        element.closest('div')?.textContent ?? element.textContent ?? '',
      ).slice(0, 120);

      return text ? `text:${text}` : null;
    }

    private stableUrlPart(value: string): string | null {
      if (!value) {
        return null;
      }

      try {
        const url = new URL(value, window.location.origin);
        const cacheKey = url.searchParams.get('ig_cache_key');
        if (cacheKey) {
          return `ig_cache_key:${cacheKey}`;
        }
        return `${url.hostname}${url.pathname}`;
      } catch {
        return value.split('?')[0] ?? null;
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
  }

  return new SelectionTargetCheck().isChecked();
}

export function collectSelectionResult({
  attemptedCount,
  checkboxSelector,
}: SelectionResultInput): SelectionResult {
  class SelectionResultCollector {
    public collect(): SelectionResult {
      const selectedSignatures = this.collectSelectedSignatures();
      const confirmedCount = this.readSelectedCount();
      const checkedCount = selectedSignatures.length;
      const hasItemCheckboxes =
        document.querySelectorAll('[data-testid="bulk_action_checkbox"]').length > 0;
      const effectiveCount = confirmedCount ?? (hasItemCheckboxes ? checkedCount : attemptedCount);

      return {
        count: effectiveCount,
        confirmedCount,
        attemptedCount,
        signatures: selectedSignatures.slice(0, effectiveCount),
        countIsCumulative: confirmedCount !== null || hasItemCheckboxes,
      };
    }

    private collectSelectedSignatures(): string[] {
      const itemCheckboxes = Array.from(
        document.querySelectorAll('[data-testid="bulk_action_checkbox"]'),
      );
      const candidates =
        itemCheckboxes.length > 0
          ? itemCheckboxes
          : Array.from(document.querySelectorAll(checkboxSelector));

      return Array.from(
        new Set(
          candidates
            .filter((checkbox) => this.isChecked(checkbox))
            .map((checkbox) => this.getItemSignature(checkbox))
            .filter((signature): signature is string => Boolean(signature)),
        ),
      );
    }

    private isChecked(element: Element): boolean {
      if (element instanceof HTMLInputElement) {
        return element.checked;
      }

      return [element, ...Array.from(element.querySelectorAll('*'))].some((node) => {
        if (node.getAttribute('aria-checked') === 'true') {
          return true;
        }

        if (!(node instanceof HTMLElement)) {
          return false;
        }

        const style = window.getComputedStyle(node);
        const mask = style.maskImage || style.webkitMaskImage || '';
        const background = style.backgroundImage || '';
        const source = node.getAttribute('src') ?? node.getAttribute('href') ?? '';
        const signature = this.normalize([mask, background, source].join(' '));

        return signature.includes('circle-check') || signature.includes('check__filled');
      });
    }

    private getItemSignature(element: Element): string | null {
      let current: Element | null = element;

      for (let depth = 0; current && depth < 12; depth += 1) {
        const directMediaId =
          current.getAttribute('media_id') ??
          current.getAttribute('data-media-id') ??
          current.getAttribute('data-id');
        if (directMediaId) {
          return `id:${directMediaId}`;
        }

        const link = current.querySelector<HTMLAnchorElement>('a[href*="/p/"], a[href*="/reel/"]');
        if (link?.href) {
          const stable = this.stableUrlPart(link.href);
          if (stable) {
            return `href:${stable}`;
          }
        }

        const image = current.querySelector<HTMLImageElement>('img[src], img[currentSrc]');
        const imageSource = image?.currentSrc || image?.src || '';
        if (imageSource && !this.isProfileAvatarUrl(imageSource)) {
          const stable = this.stableUrlPart(imageSource);
          if (stable) {
            return `image:${stable}`;
          }
        }

        current = current.parentElement;
      }

      return this.textPositionSignature(element);
    }

    private isProfileAvatarUrl(value: string): boolean {
      return /\/t51\.[^/]+-19\//.test(value);
    }

    private textPositionSignature(element: Element): string | null {
      let current: Element | null = element;

      for (let depth = 0; current && depth < 12; depth += 1) {
        const ariaLabel = current.getAttribute('aria-label');
        if (ariaLabel && !/casilla|checkbox|seleccionar/i.test(ariaLabel)) {
          const normalizedLabel = this.normalize(ariaLabel).slice(0, 120);
          if (normalizedLabel) {
            return `aria:${normalizedLabel}`;
          }
        }
        current = current.parentElement;
      }

      const text = this.normalize(
        element.closest('div')?.textContent ?? element.textContent ?? '',
      ).slice(0, 120);

      return text ? `text:${text}` : null;
    }

    private stableUrlPart(value: string): string | null {
      if (!value) {
        return null;
      }

      try {
        const url = new URL(value, window.location.origin);
        const cacheKey = url.searchParams.get('ig_cache_key');
        if (cacheKey) {
          return `ig_cache_key:${cacheKey}`;
        }
        return `${url.hostname}${url.pathname}`;
      } catch {
        return value.split('?')[0] ?? null;
      }
    }

    private readSelectedCount(): number | null {
      const text = Array.from(document.querySelectorAll('div, span, button'))
        .map((element) => element.textContent?.replace(/\s+/g, ' ').trim() ?? '')
        .filter(Boolean)
        .join(' | ');
      const patterns = [
        /(\d+)\s+selected/i,
        /selected\s+(\d+)/i,
        /(\d+)\s+items?\s+selected/i,
        /sélectionné(?:s)?\s*:?\s*(\d+)/i,
        /(\d+)\s+sélectionné(?:s)?/i,
      ];

      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match?.[1]) {
          return Number(match[1]);
        }
      }

      return null;
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
  }

  return new SelectionResultCollector().collect();
}

export interface FastSelectInput {
  checkboxSelector: string;
  controlText: string[];
  limit: number;
  ignoredKeys?: string[];
  minDelayMs?: number;
  maxDelayMs?: number;
}

export interface FastSelectResult {
  clickedKeys: string[];
  exhausted: boolean;
  rounds: number;
  lastBatch: number;
  lastChecked: number;
  history: string[];
}

export async function selectBatchInPage({
  checkboxSelector,
  controlText,
  limit,
  ignoredKeys = [],
  minDelayMs = 20,
  maxDelayMs = 40,
}: FastSelectInput): Promise<FastSelectResult> {
  class FastBatchSelector {
    private readonly clickedKeys: string[] = [];
    private readonly clickedSet = new Set<string>();
    private readonly ignored = new Set(ignoredKeys);
    private readonly controls = controlText
      .map((word) => word.trim().toLowerCase())
      .filter(Boolean);

    public async run(): Promise<FastSelectResult> {
      let emptyRounds = 0;
      let rounds = 0;
      const selectionDeadline = Date.now() + 30_000;
      let lastBatch = 0;
      let lastChecked = 0;
      const history: string[] = [];

      while (this.clickedKeys.length < limit) {
        if (rounds >= 8 || Date.now() > selectionDeadline) {
          break;
        }
        const elements = this.scan().slice(0, limit - this.clickedKeys.length);

        if (elements.length === 0) {
          emptyRounds += 1;
          const scrolled = await this.scrollAndWait();
          if (!scrolled && emptyRounds >= 4) {
            break;
          }
          continue;
        }

        emptyRounds = 0;
        rounds += 1;
        const batch: Array<{ element: Element; key: string }> = [];
        for (const element of elements) {
          const key = this.keyFor(element);
          if (this.ignored.has(key) || this.clickedSet.has(key)) {
            continue;
          }
          this.clickCandidate(element);
          batch.push({ element, key });
          await this.delay(
            minDelayMs + Math.round(Math.random() * Math.max(1, maxDelayMs - minDelayMs)),
          );
        }

        lastBatch = batch.length;
        await this.delay(800);
        lastChecked = batch.filter((item) => !item.element.isConnected || this.isChecked(item.element))
          .length;
        history.push(`${batch.length}->${lastChecked}`);
        for (const item of batch) {
          const failed = item.element.isConnected && !this.isChecked(item.element);
          if (!failed && !this.clickedSet.has(item.key)) {
            this.clickedSet.add(item.key);
            this.clickedKeys.push(item.key);
          }
        }
      }

      return {
        clickedKeys: this.clickedKeys,
        exhausted: this.clickedKeys.length < limit,
        rounds,
        lastBatch,
        lastChecked,
        history,
      };
    }

    private delay(ms: number): Promise<void> {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    private scan(): Element[] {
      const itemCheckboxes = Array.from(
        document.querySelectorAll('[data-testid="bulk_action_checkbox"]'),
      );
      const elements =
        itemCheckboxes.length > 0
          ? itemCheckboxes
          : Array.from(document.querySelectorAll(checkboxSelector));

      return elements.filter(
        (element) =>
          this.isVisible(element) &&
          !this.isControl(element) &&
          !this.isNavigationCandidate(element) &&
          this.looksLikeCheckbox(element) &&
          !this.isChecked(element),
      );
    }

    private looksLikeCheckbox(element: Element): boolean {
      if (element instanceof HTMLInputElement) {
        return element.type === 'checkbox';
      }
      const testId = (element.getAttribute('data-testid') ?? '').toLowerCase();
      const role = (element.getAttribute('role') ?? '').toLowerCase();
      const ariaLabel = (element.getAttribute('aria-label') ?? '').toLowerCase();
      const rect = element.getBoundingClientRect();
      const longest = Math.max(rect.width, rect.height);
      const shortest = Math.min(rect.width, rect.height);
      return (
        testId === 'bulk_action_checkbox' ||
        role === 'checkbox' ||
        element.hasAttribute('aria-checked') ||
        ariaLabel.includes('checkbox') ||
        ariaLabel.includes('casilla') ||
        (shortest >= 8 && longest <= 96 && longest / shortest <= 3)
      );
    }

    private isChecked(element: Element): boolean {
      if (element instanceof HTMLInputElement) {
        return element.checked;
      }
      return [element, ...Array.from(element.querySelectorAll('*'))].some((node) => {
        if (node.getAttribute('aria-checked') === 'true') {
          return true;
        }
        if (!(node instanceof HTMLElement)) {
          return false;
        }
        const style = window.getComputedStyle(node);
        const mask = style.maskImage || style.webkitMaskImage || '';
        const background = style.backgroundImage || '';
        const source = node.getAttribute('src') ?? node.getAttribute('href') ?? '';
        const signature = `${mask} ${background} ${source}`.toLowerCase();
        return signature.includes('circle-check') || signature.includes('check__filled');
      });
    }

    private clickCandidate(element: Element): void {
      const clickable =
        element.querySelector<HTMLElement>('[role="button"],[tabindex="0"],button') ??
        (element instanceof HTMLElement ? element : null);
      clickable?.click();
    }

    private isVisible(element: Element): boolean {
      if (element.closest('[aria-hidden="true"]')) {
        return false;
      }
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return (
        rect.width >= 8 &&
        rect.height >= 8 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none'
      );
    }

    private isControl(element: Element): boolean {
      const text = (element.textContent || element.getAttribute('aria-label') || '')
        .trim()
        .toLowerCase();
      return this.controls.some((word) => text.includes(word));
    }

    private isNavigationCandidate(element: Element): boolean {
      const link = element.closest('a[href]');
      const href = link?.getAttribute('href') ?? '';
      return (
        href.includes('facebook.com/help') ||
        href.includes('/help/') ||
        href.includes('/web/lite') ||
        href.includes('/p/') ||
        href.includes('/reel/')
      );
    }

    private async scrollAndWait(): Promise<boolean> {
      const boxes = Array.from(document.querySelectorAll(checkboxSelector));
      const last = boxes.at(-1);
      if (!last) {
        return false;
      }
      const beforeTop = last.getBoundingClientRect().top;
      const beforeCount = boxes.length;
      last.scrollIntoView({ block: 'center' });

      let scroller: Element | null = last.parentElement;
      while (scroller && scroller !== document.body) {
        const style = window.getComputedStyle(scroller);
        const scrollable =
          (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
          scroller.scrollHeight > scroller.clientHeight + 10;
        if (scrollable) {
          scroller.scrollTop = Math.min(
            scroller.scrollHeight,
            scroller.scrollTop + Math.round(scroller.clientHeight * 0.8),
          );
          break;
        }
        scroller = scroller.parentElement;
      }
      if (!scroller || scroller === document.body) {
        window.scrollBy(0, Math.round(window.innerHeight * 0.6));
      }
      await this.delay(900);

      const afterBoxes = Array.from(document.querySelectorAll(checkboxSelector));
      const newLast = afterBoxes.at(-1);
      if (!newLast) {
        return false;
      }
      const afterTop = newLast.getBoundingClientRect().top;
      return (
        newLast !== last ||
        Math.abs(afterTop - beforeTop) > 4 ||
        afterBoxes.length !== beforeCount
      );
    }

    private keyFor(element: Element): string {
      let current: Element | null = element;
      for (let depth = 0; current && depth < 12; depth += 1) {
        const mediaId =
          current.getAttribute('media_id') ??
          current.getAttribute('data-media-id') ??
          current.getAttribute('data-id');
        if (mediaId) {
          return `id:${mediaId}`;
        }
        const link = current.querySelector<HTMLAnchorElement>('a[href*="/p/"], a[href*="/reel/"]');
        if (link?.href) {
          return `href:${this.stableUrlPart(link.href)}`;
        }
        const image = current.querySelector<HTMLImageElement>('img[src], img[currentSrc]');
        const imageSource = image?.currentSrc || image?.src || '';
        if (imageSource && !/\/t51\.[^/]+-19\//.test(imageSource)) {
          return `image:${this.stableUrlPart(imageSource)}`;
        }
        current = current.parentElement;
      }

      let labelNode: Element | null = element;
      for (let depth = 0; labelNode && depth < 12; depth += 1) {
        const ariaLabel = labelNode.getAttribute('aria-label');
        if (ariaLabel && !/casilla|checkbox|seleccionar/i.test(ariaLabel)) {
          return `aria:${ariaLabel.trim().slice(0, 120).toLowerCase()}`;
        }
        labelNode = labelNode.parentElement;
      }

      const rect = element.getBoundingClientRect();
      return `point:${Math.round((rect.left + rect.width / 2) / 16)}:${Math.round(
        (rect.top + rect.height / 2) / 16,
      )}`;
    }

    private stableUrlPart(value: string): string {
      try {
        const url = new URL(value, window.location.origin);
        return url.searchParams.get('ig_cache_key') ?? `${url.hostname}${url.pathname}`;
      } catch {
        return value.split('?')[0] ?? value;
      }
    }
  }

  return new FastBatchSelector().run();
}
