import process from 'node:process';

export type ProgressPhase =
  | 'prepare'
  | 'select'
  | 'delete'
  | 'confirm'
  | 'wait'
  | 'done'
  | 'error';

const phaseFrames: Record<ProgressPhase, string[]> = {
  prepare: ['¯\\_(ツ)_/¯', ' ¯\\_(ツ)_/¯', '  ¯\\_(ツ)_/¯', ' ¯\\_(ツ)_/¯'],
  select: ['¯\\_( ツ )_/¯', '¯\\_(ツ )_/¯', '¯\\_( ツ)_/¯', '¯\\_(ツ)_/¯'],
  delete: ['¯\\_(ò_ó)_/¯', '¯\\_(ó_ò)_/¯', '¯\\_(ò_ó)_/¯', '¯\\_(ツ)_/¯'],
  confirm: ['¯\\_(ツ)_/¯?', '¯\\_(ツ)_/¯ ??', '¯\\_(ツ)_/¯ ???'],
  wait: ['¯\\_(ツ)_/¯ .', '¯\\_(ツ)_/¯ ..', '¯\\_(ツ)_/¯ ...'],
  done: ['¯\\_(ツ)_/¯ ✓'],
  error: ['¯\\_(x_x)_/¯'],
};

const intervalMs = 140;

// Siempre habilitado para que el usuario vea la animación en cualquier terminal
const isWindows = process.platform === 'win32';
const clearLine = isWindows ? '\r' : '\r\x1b[2K';

export class ShruggieProgress {
  private timer: ReturnType<typeof setInterval> | null = null;
  private frameIndex = 0;
  private phase: ProgressPhase = 'prepare';
  private message = '';
  private details = '';
  private readonly enabled = true;

  public start(message: string, details = ''): void {
    this.message = message;
    this.details = details;
    this.phase = 'prepare';
    this.frameIndex = 0;
    this.render();

    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      this.frameIndex += 1;
      this.render();
    }, intervalMs);
    this.timer.unref?.();
  }

  public setPhase(phase: ProgressPhase, message?: string, details?: string): void {
    this.phase = phase;
    if (message !== undefined) {
      this.message = message;
    }
    if (details !== undefined) {
      this.details = details;
    }
    this.render();
  }

  public stop(message?: string, details?: string): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    const frame = phaseFrames[this.phase][0] ?? '';
    const finalMessage = message ?? this.message;
    const finalDetails = details ?? this.details;
    const line = [frame, finalMessage, finalDetails].filter(Boolean).join('  ');
    process.stdout.write(`${clearLine}${line}\n`);
  }

  private render(): void {
    const frames = phaseFrames[this.phase];
    const frame = frames[this.frameIndex % frames.length] ?? '';
    const line = [frame, this.message, this.details].filter(Boolean).join('  ');
    process.stdout.write(`${clearLine}${line}`);
  }
}