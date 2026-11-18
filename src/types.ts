import type { LogLevel } from './utils/logger.js';

export type CleanupMode = 'likes' | 'comments';

export type TranslationValue = string | string[];

export type TranslationDictionary = Record<string, TranslationValue>;

export interface DateRange {
  from: Date | null;
  to: Date | null;
}

export interface NumberRange {
  min: number;
  max: number;
}

export interface BlockAccountEntry {
  username: string;
  note?: string;
}

export interface BlockAccountsOptions {
  accountDelay: NumberRange;
  confirmDelay: NumberRange;
  limit: number | undefined;
  dryRun?: boolean;
  ledgerPath?: string;
  failuresPath?: string;
}

export interface BlockAccountsResult {
  blocked: number;
  alreadyBlocked: number;
  notFound: number;
  failed: number;
  wouldBlock: number;
  skipped: number;
}

export interface CliOptions {
  modes: CleanupMode[];
  blockAccounts: boolean;
  accountsFile: string;
  hybrid: boolean;
  hybridPasses: number;
  blockLimit: number | undefined;
  blockDryRun: boolean;
  blockDelay: NumberRange;
  browser: string;
  range: DateRange;
  batchSize: NumberRange;
  clickDelay: NumberRange;
  batchDelay: NumberRange;
  confirmDelay: NumberRange;
  limit?: number;
  profileDir?: string;
  profileName?: string;
  chromeExecutablePath?: string;
  useSystemProfile: boolean;
  loginTimeout: number;
  translationsPath?: string;
  notifyPrompts: boolean;
  notifyDone: boolean;
  closeOnFinish: boolean;
  toastTimeoutMs: number;
  errorDialogTimeoutMs: number;
  dryRun: boolean;
  noSandbox: boolean;
  logLevel: LogLevel;
  recoverOnError: boolean;
}

export interface TargetConfiguration {
  mode: CleanupMode;
  url: string;
  selectLabels: string[];
  actionLabels: string[];
  confirmLabels: string[];
}

export interface CleanupOptions {
  batchSize: NumberRange;
  clickDelay: NumberRange;
  batchDelay: NumberRange;
  confirmDelay: NumberRange;
  toastTimeoutMs: number;
  errorDialogTimeoutMs: number;
  limit?: number;
  dryRun: boolean;
}
