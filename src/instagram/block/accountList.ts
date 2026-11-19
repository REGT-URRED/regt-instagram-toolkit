import fs from 'node:fs';
import type { BlockAccountEntry } from '../../types.js';

const reserved: Record<string, true> = {
  p: true,
  reel: true,
  reels: true,
  explore: true,
  accounts: true,
  stories: true,
  tv: true,
  direct: true,
  about: true,
  legal: true,
  developer: true,
};

export function extractUsernames(text: string): string[] {
  const found = new Set<string>();

  for (const line of text.split(/\r?\n/)) {
    for (const match of line.matchAll(/instagram\.com\/([A-Za-z0-9_.]+)/g)) {
      const username = match[1]?.replace(/\.+$/, '');
      if (username && reserved[username.toLowerCase()] !== true) {
        found.add(username);
      }
    }

    const bare = line
      .replace(/#.*$/, '')
      .replace(/^[-*]\s*/, '')
      .replace(/^<|>$/g, '')
      .trim();
    if (/^@?[A-Za-z0-9_.]{2,30}$/.test(bare)) {
      const username = bare.replace(/^@/, '');
      if (reserved[username.toLowerCase()] !== true) {
        found.add(username);
      }
    }
  }

  return Array.from(found);
}

export function parseAccountsFile(filePath: string): BlockAccountEntry[] {
  const raw = fs.readFileSync(filePath, 'utf8');
  const extension = filePath.toLowerCase();

  if (extension.endsWith('.txt') || extension.endsWith('.md')) {
    return extractUsernames(raw).map((username) => ({ username }));
  }

  const parsed: unknown = JSON.parse(raw);
  let list: unknown[];

  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (
    parsed &&
    typeof parsed === 'object' &&
    'accounts' in parsed &&
    Array.isArray(parsed.accounts)
  ) {
    list = parsed.accounts;
  } else {
    throw new Error(
      `The accounts file must contain an array or an object with an "accounts" array: ${filePath}`,
    );
  }

  return list.map((entry) => {
    if (typeof entry === 'string') {
      return { username: entry };
    }

    if (
      entry &&
      typeof entry === 'object' &&
      'username' in entry &&
      typeof entry.username === 'string'
    ) {
      const note = 'note' in entry && typeof entry.note === 'string' ? entry.note : undefined;
      return note === undefined ? { username: entry.username } : { username: entry.username, note };
    }

    throw new Error('Each account must be a username string or an object with a "username" field.');
  });
}
