#!/usr/bin/env node

import fs from 'node:fs';
import process from 'node:process';
import { parseAccountsFile } from './instagram/block/accountList.js';

const listPath = process.argv[2] ?? './instagram_consolidado_ampliado.md';
const ledgerPath = './.state/block-ledger.jsonl';
const accounts = parseAccountsFile(listPath);
const statuses = new Map<string, string>();

if (fs.existsSync(ledgerPath)) {
  for (const line of fs.readFileSync(ledgerPath, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    try {
      const entry = JSON.parse(line) as { username?: string; status?: string };
      if (entry.username && entry.status) {
        statuses.set(entry.username, entry.status);
      }
    } catch {
      // ignore malformed lines
    }
  }
}

let blocked = 0;
let already = 0;
let failed = 0;
for (const account of accounts) {
  const status = statuses.get(account.username);
  if (status === 'blocked') {
    blocked += 1;
  } else if (status === 'alreadyBlocked') {
    already += 1;
  } else if (status === 'failed') {
    failed += 1;
  }
}
const pending = accounts.filter((account) => !statuses.has(account.username)).length;

console.log(
  `Lista: ${accounts.length} · bloqueadas ${blocked} · ya bloqueadas ${already} · fallos ${failed} · pendientes ${pending}`,
);
