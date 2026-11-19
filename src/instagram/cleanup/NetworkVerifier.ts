import type { HTTPRequest, HTTPResponse } from 'puppeteer-core';
import type { CleanupContext } from './CleanupContext.js';
import type { InstagramMutationResult } from './types.js';

export class NetworkVerifier {
  public constructor(private readonly context: CleanupContext) {}

  public waitForMutation(timeout = 20_000): Promise<InstagramMutationResult | null> {
    return this.context.page
      .waitForResponse((candidate) => this.isRelevantMutation(candidate), { timeout })
      .then(async (response) => {
        const request = response.request();
        const result = {
          method: request.method().toUpperCase(),
          status: response.status(),
          url: response.url(),
        };
        this.context.lastMutation = result;

        if (result.status >= 200 && result.status < 300) {
          this.context.debug(
            `Instagram cleanup response: HTTP ${result.status} ${result.method} ${result.url}`,
          );
        } else {
          this.context.warn(
            `Instagram cleanup response failed: HTTP ${result.status} ${result.method} ${result.url} ${await this.readResponseSnippet(response)}`,
          );
        }

        return result;
      })
      .catch(() => null);
  }

  private async readResponseSnippet(response: HTTPResponse): Promise<string> {
    try {
      const text = await response.text();
      return text.replace(/\s+/g, ' ').slice(0, 500);
    } catch {
      return '';
    }
  }

  public ensureMutationSucceeded(result: InstagramMutationResult | null): void {
    if (!result) {
      this.context.warn(
        'No matching Instagram delete/unlike request was detected after confirmation.',
      );
      return;
    }

    if (result.status < 200 || result.status >= 300) {
      throw new Error(
        `Instagram cleanup request failed with HTTP ${result.status}: ${result.method} ${result.url}`,
      );
    }

    this.context.debug(`Instagram cleanup request succeeded: HTTP ${result.status}`);
  }

  private async isRelevantMutation(response: HTTPResponse): Promise<boolean> {
    const request = response.request();
    const method = request.method().toUpperCase();

    if (!['POST', 'DELETE', 'PATCH'].includes(method)) {
      return false;
    }

    const responseUrl = new URL(response.url());
    if (!responseUrl.hostname.endsWith('instagram.com')) {
      return false;
    }

    const pathname = responseUrl.pathname.toLowerCase();
    const search = responseUrl.search.toLowerCase();
    const appId = responseUrl.searchParams.get('appid')?.toLowerCase() ?? '';
    const requestType = responseUrl.searchParams.get('type')?.toLowerCase() ?? '';
    const isWbloksAction = pathname.includes('/async/wbloks/fetch') && requestType === 'action';

    // The exclusion list must only inspect the URL. Instagram request bodies
    // routinely contain words such as "events", so matching them against the
    // payload discarded every real unlike/delete request.
    if (
      [
        '/logging_client_events',
        '/ajax/events',
        '/ajax/bz',
        '/ajax/qm/',
        '/falco',
        '/qe/sync',
        '/batch_fetch',
      ].some((fragment) => pathname.includes(fragment))
    ) {
      return false;
    }

    if (this.context.target.mode === 'likes') {
      // The activity center fires the unlike as a wbloks action whose appid is
      // com.instagram.privacy.activity_center.liked_unlike, so the URL alone is
      // enough to identify it without reading the request body.
      return (
        pathname.includes('/likes/') ||
        search.includes('unlike') ||
        appId.includes('liked_unlike') ||
        (isWbloksAction && appId.includes('unlike'))
      );
    }

    if (
      pathname.includes('comment') &&
      (pathname.includes('delete') || pathname.includes('remove') || method === 'DELETE')
    ) {
      return true;
    }

    if (
      isWbloksAction &&
      appId.includes('activity_center') &&
      appId.includes('comment') &&
      (appId.includes('delete') || appId.includes('remove'))
    ) {
      return true;
    }

    if (!request.hasPostData()) {
      return false;
    }

    const payload = await this.getRequestPayload(request);
    return payload.includes('comment') && (payload.includes('delete') || payload.includes('remove'));
  }

  private async getRequestPayload(request: HTTPRequest): Promise<string> {
    if (!request.hasPostData()) {
      return '';
    }
    return ((await request.fetchPostData().catch(() => undefined)) ?? '').toLowerCase();
  }
}
