import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'puppeteer';

export interface RecordedMutation {
  at: string;
  method: string;
  url: string;
  status: number;
  contentType?: string;
  postData?: string;
  bodySnippet?: string;
}

const mutationPattern = /unlike|delete|block|comment|feedback_required/i;

/**
 * Records (never replays) the web app's own mutation requests. The header set is
 * stored without cookies or CSRF values so the ledger is safe to keep local.
 */
export class MutationRecorder {
  public constructor(private readonly filePath: string) {}

  public attach(page: Page): void {
    page.on('response', (response) => {
      const request = response.request();
      const method = request.method();

      if (method === 'GET') {
        return;
      }

      const url = request.url();
      const postData = request.postData() ?? '';
      const isMutationEndpoint =
        /instagram\.com\/(api|graphql)/.test(url) || /\/async\/wbloks\/fetch\//.test(url);
      if (!isMutationEndpoint || !mutationPattern.test(`${url} ${postData}`)) {
        return;
      }

      response
        .text()
        .catch(() => '')
        .then((body) => {
          const contentType = response.headers()['content-type'];
          const record: RecordedMutation = {
            at: new Date().toISOString(),
            method,
            url,
            status: response.status(),
            ...(contentType ? { contentType } : {}),
            ...(postData ? { postData: postData.slice(0, 4_000) } : {}),
            ...(body ? { bodySnippet: body.slice(0, 1_000) } : {}),
          };
          fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
          fs.appendFileSync(this.filePath, `${JSON.stringify(record)}\n`);
        })
        .catch(() => undefined);
    });
  }
}
