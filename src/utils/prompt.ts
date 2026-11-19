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

// Arrow keys, focus events and paste markers arrive as ANSI escape sequences.
// In raw mode they must be stripped before the input can be read as text.
const ansiSequence = new RegExp(
  ['\\u001b\\[[0-9;?]*[A-Za-z~]', '\\u001b[OPQRS]', '\\u001b'].join('|'),
  'g',
);

function stripAnsiSequences(text: string): string {
  return text.replace(ansiSequence, '');
}

export async function readKey(promptText: string): Promise<string> {
  if (!canPromptInteractively()) {
    return nextPipedAnswer(promptText).charAt(0).toLowerCase();
  }

  process.stdout.write(promptText);
  process.stdin.setRawMode(true);
  process.stdin.resume();

  return new Promise<string>((resolve) => {
    let settled = false;

    const finish = (result: string): void => {
      if (settled) {
        return;
      }

      settled = true;
      process.stdin.off('data', onData);
      process.stdin.off('end', onEnd);
      restoreStdin();
      resolve(result);
    };

    const onEnd = (): void => {
      finish('');
    };

    const onData = (chunk: Buffer): void => {
      const raw = chunk.toString('utf8');

      if (raw.includes('\u0003')) {
        finish('');
        handleInterrupt();
      }

      // Enter may arrive as \r, \n or \r\n inside a single chunk.
      if (/[\r\n]/.test(raw)) {
        process.stdout.write('\n');
        finish('');
        return;
      }

      const text = stripAnsiSequences(raw);
      const char = Array.from(text).find((candidate) => candidate >= ' ');

      if (!char) {
        return;
      }

      const normalized = char.toLowerCase();
      process.stdout.write(`${normalized}\n`);
      finish(normalized);
    };

    process.stdin.on('data', onData);
    process.stdin.once('end', onEnd);
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
    let settled = false;

    const finish = (result: string): void => {
      if (settled) {
        return;
      }

      settled = true;
      process.stdin.off('data', onData);
      process.stdin.off('end', onEnd);
      restoreStdin();
      resolve(result);
    };

    const onEnd = (): void => {
      finish(value.trim());
    };

    const onData = (chunk: Buffer): void => {
      const text = stripAnsiSequences(chunk.toString('utf8'));

      for (const char of text) {
        if (char === '\u0003') {
          finish('');
          handleInterrupt();
        }

        if (char === '\r' || char === '\n') {
          process.stdout.write('\n');
          finish(value.trim());
          return;
        }

        if (char === '\u007f' || char === '\b') {
          if (value.length > 0) {
            value = value.slice(0, -1);
            process.stdout.write('\b \b');
          }
          continue;
        }

        if (char >= ' ') {
          value += char;
          process.stdout.write(char);
        }
      }
    };

    process.stdin.on('data', onData);
    process.stdin.once('end', onEnd);
  });
}
