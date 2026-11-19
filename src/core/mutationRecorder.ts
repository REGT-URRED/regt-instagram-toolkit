import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'puppeteer-core';

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
// Best-effort redaction of credentials that may travel inside the request body.
const sensitiveFieldPattern =
  /("?(?:cookie|csrftoken|x-csrftoken|x-ig-www-claim|nonce|sessionid|authorization|ds_user_id)"?\s*[:=]\s*)("?)([^&",}\n]*)(\2)/gi;

function redactSensitive(value: string): string {
  return value.replace(
    sensitiveFieldPattern,
    (_match: string, prefix: string, quote: string) => `${prefix}${quote}[redacted]${quote}`,
  );
}

/**
 * Records (never replays) the site's own mutation traffic. For non-GET requests
 * to /api, /graphql or /async/wbloks/fetch whose URL or raw postData matches
 * unlike|delete|block|comment (or feedback_required) it appends one JSONL line:
 * method, URL, status, content type, the raw postData up to 4 KB and the
 * response body up to 1 KB. The match runs on the unredacted payload, so
 * redaction never changes behaviour. Cookie, CSRF token, nonce, session and
 * authorization values are redacted before writing, and request headers are
 * never stored. Pass --no-store (or --privacy) to disable the recorder.
 */
export class MutationRecorder {
  public constructor(private readonly filePath?: string) {}

  public attach(page: Page): void {
    const filePath = this.filePath;
    if (!filePath) {
      return;
    }

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
            url: redactSensitive(url),
            status: response.status(),
            ...(contentType ? { contentType } : {}),
            ...(postData ? { postData: redactSensitive(postData.slice(0, 4_000)) } : {}),
            ...(body ? { bodySnippet: redactSensitive(body.slice(0, 1_000)) } : {}),
          };
          fs.mkdirSync(path.dirname(filePath), { recursive: true });
          fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`);
        })
        .catch(() => undefined);
    });
  }
}
