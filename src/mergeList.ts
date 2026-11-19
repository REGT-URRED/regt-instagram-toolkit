#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
const targetFile = path.resolve(
  process.env['REGT_LIST_FILE'] ?? './instagram_consolidado_ampliado.md',
);
const sources = process.argv.slice(2);

import { extractUsernames } from './instagram/block/accountList.js';

if (sources.length === 0) {
  console.error('Uso: npm run list:merge -- archivo1 [archivo2...]');
  process.exit(1);
}

const existingText = fs.existsSync(targetFile) ? fs.readFileSync(targetFile, 'utf8') : '';
const existing = new Set(extractUsernames(existingText));
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
