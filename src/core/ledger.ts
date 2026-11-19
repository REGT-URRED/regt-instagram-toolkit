import fs from 'node:fs';
import path from 'node:path';

export type LedgerStatus = 'processed' | 'skipped' | 'failed';

interface LedgerEntry {
  id: string;
  status: LedgerStatus;
  at: string;
}

/**
 * Append-only JSONL ledger keyed by stable item signatures. A restarted run can
 * skip work that already succeeded, and duplicate work is harmless. With no
 * file path (privacy mode) the ledger stays in memory and never touches disk.
 */
export class Ledger {
  private readonly ids = new Set<string>();

  public constructor(private readonly filePath?: string) {}

  public load(): void {
    if (!this.filePath || !fs.existsSync(this.filePath)) {
      return;
    }

    for (const line of fs.readFileSync(this.filePath, 'utf8').split('\n')) {
      if (!line.trim()) {
        continue;
      }

      try {
        const entry = JSON.parse(line) as LedgerEntry;
        if (entry.status === 'processed' && entry.id) {
          this.ids.add(entry.id);
        }
      } catch {
        // Ignore a torn last line from an interrupted run.
      }
    }
  }

  public has(id: string): boolean {
    return this.ids.has(id);
  }

  public mark(id: string, status: LedgerStatus): void {
    if (status === 'processed') {
      this.ids.add(id);
    }

    if (!this.filePath) {
      return;
    }

    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const entry: LedgerEntry = { id, status, at: new Date().toISOString() };
    fs.appendFileSync(this.filePath, `${JSON.stringify(entry)}\n`);
  }

  public get size(): number {
    return this.ids.size;
  }
}
