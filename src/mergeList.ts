#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const targetFile = path.resolve(
  process.env['REGT_LIST_FILE'] ?? './instagram_consolidado_ampliado.md',
);
const sources = process.argv.slice(2);

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

function extractUsernames(text: string): Set<string> {
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

  return found;
}

if (sources.length === 0) {
  console.error('Uso: npm run list:merge -- archivo1 [archivo2...]');
  process.exit(1);
}

const existingText = fs.existsSync(targetFile) ? fs.readFileSync(targetFile, 'utf8') : '';
const existing = extractUsernames(existingText);
const added: string[] = [];
let duplicates = 0;

for (const source of sources) {
  const text = fs.readFileSync(path.resolve(source), 'utf8');
  for (const username of extractUsernames(text)) {
    if (existing.has(username)) {
      duplicates += 1;
      continue;
    }
    existing.add(username);
    added.push(username);
  }
}

if (added.length > 0) {
  const block = added.map((username) => `- <https://www.instagram.com/${username}/>`).join('\n');
  const prefix = existingText.endsWith('\n') || existingText === '' ? '' : '\n';
  fs.writeFileSync(targetFile, `${existingText}${prefix}${block}\n`);
}

console.log(
  `Añadidas ${added.length} · ya estaban ${duplicates} · total en la lista ${existing.size}`,
);
