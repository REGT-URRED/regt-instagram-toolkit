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
const trailingPadding = '        ';

export class ShruggieProgress {
  private timer: ReturnType<typeof setInterval> | null = null;
  private frameIndex = 0;
  private phase: ProgressPhase = 'prepare';
  private message = '';
  private details = '';
  private lastStaticLine = '';
  private readonly animated = Boolean(process.stdout.isTTY);

  public start(message: string, details = ''): void {
    this.message = message;
    this.details = details;
    this.phase = 'prepare';
    this.frameIndex = 0;

    if (!this.animated) {
      this.writeStatic();
      return;
    }

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

    if (this.animated) {
      this.render();
      return;
    }

    this.writeStatic();
  }

  public stop(message?: string, details?: string): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    const finalMessage = message ?? this.message;
    const finalDetails = details ?? this.details;

    if (!this.animated) {
      const line = this.buildLine(finalMessage, finalDetails);
      if (line !== this.lastStaticLine) {
        process.stdout.write(`${line}\n`);
        this.lastStaticLine = line;
      }
      return;
    }

    const frame = phaseFrames[this.phase][0] ?? '';
    const line = [frame, finalMessage, finalDetails].filter(Boolean).join('  ');
    process.stdout.write(`\r${line}${trailingPadding}\n`);
  }

  private buildLine(message = this.message, details = this.details): string {
    const frames = phaseFrames[this.phase];
    const frame = frames[this.frameIndex % frames.length] ?? '';
    return [frame, message, details].filter(Boolean).join('  ');
  }

  private writeStatic(): void {
    const line = this.buildLine();
    if (line === this.lastStaticLine) {
      return;
    }

    this.lastStaticLine = line;
    process.stdout.write(`${line}\n`);
  }

  private render(): void {
    process.stdout.write(`\r${this.buildLine()}${trailingPadding}`);
  }
}
