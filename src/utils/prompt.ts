import { readFileSync } from 'node:fs';
import process from 'node:process';

function canPromptInteractively(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function restoreStdin(): void {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }
  process.stdin.pause();
}

function handleInterrupt(): never {
  process.stdout.write('\n');
  process.exit(130);
}

let pipedAnswers: string[] | null = null;

function nextPipedAnswer(promptText: string): string {
  if (pipedAnswers === null) {
    process.stdout.write(promptText);
    try {
      pipedAnswers = readFileSync(0, 'utf8').split(/\r?\n/);
    } catch {
      pipedAnswers = [];
    }
  }

  const answer = (pipedAnswers.shift() ?? '').trim();
  process.stdout.write(`${answer}\n`);
  return answer;
}

export async function readKey(promptText: string): Promise<string> {
  if (!canPromptInteractively()) {
    return nextPipedAnswer(promptText).charAt(0).toLowerCase();
  }

  process.stdout.write(promptText);
  process.stdin.setRawMode(true);
  process.stdin.resume();

  return new Promise<string>((resolve) => {
    const finish = (): void => {
      process.stdin.off('data', onData);
      restoreStdin();
    };
    const onData = (chunk: Buffer): void => {
      const text = chunk.toString('utf8');
      if (text.includes('\u0003')) {
        finish();
        handleInterrupt();
      }
      if (text === '\r' || text === '\n') {
        finish();
        process.stdout.write('\n');
        resolve('');
        return;
      }
      const char = text.replace(/[\r\n]/g, '').charAt(0);
      if (!char || char === '\u001b') {
        return;
      }
      finish();
      const normalized = char.toLowerCase();
      process.stdout.write(`${normalized}\n`);
      resolve(normalized);
    };
    process.stdin.on('data', onData);
  });
}

export async function readLine(promptText: string): Promise<string> {
  if (!canPromptInteractively()) {
    return nextPipedAnswer(promptText);
  }

  process.stdout.write(promptText);
  process.stdin.setRawMode(true);
  process.stdin.resume();

  return new Promise<string>((resolve) => {
    let value = '';
    const finish = (): void => {
      process.stdin.off('data', onData);
      restoreStdin();
    };
    const onData = (chunk: Buffer): void => {
      const text = chunk.toString('utf8');
      for (const char of text) {
        if (char === '\u0003') {
          finish();
          handleInterrupt();
        }
        if (char === '\r' || char === '\n') {
          finish();
          process.stdout.write('\n');
          resolve(value.trim());
          return;
        }
        if (char === '\u007f' || char === '\b') {
          if (value.length > 0) {
            value = value.slice(0, -1);
            process.stdout.write('\b \b');
          }
          continue;
        }
        if (char === '\u001b') {
          continue;
        }
        if (char >= ' ') {
          value += char;
          process.stdout.write(char);
        }
      }
    };
    process.stdin.on('data', onData);
  });
}
