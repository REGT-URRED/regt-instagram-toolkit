import { readKey, readLine } from './prompt.js';

export interface ParseSuccess<T> {
  ok: true;
  value: T;
}

export interface ParseFailure {
  ok: false;
  reason: string;
}

export type ParseResult<T> = ParseSuccess<T> | ParseFailure;

export interface ValidatedPromptOptions<T> {
  prompt: string;
  defaultValue: T;
  parse: (raw: string) => ParseResult<T>;
  hint?: string;
  maxAttempts?: number;
}

export interface KeyChoice {
  key: string;
  value: string;
  label: string;
}

export interface KeyPromptOptions {
  prompt: string;
  choices: KeyChoice[];
  defaultKey: string;
  maxAttempts?: number;
}

const defaultMaxAttempts = 5;

/**
 * Asks a question until the answer is valid.
 *
 * - Empty input uses the default value.
 * - Invalid input explains the problem and asks again instead of exiting.
 * - After several invalid answers, or when the input is piped and exhausted,
 *   the default value is used so the menu can never hang forever.
 */
export async function askValidated<T>(options: ValidatedPromptOptions<T>): Promise<T> {
  const maxAttempts = options.maxAttempts ?? defaultMaxAttempts;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const raw = (await readLine(options.prompt)).trim();

    if (raw === '') {
      return options.defaultValue;
    }

    const result = options.parse(raw);
    if (result.ok) {
      return result.value;
    }

    console.log(`  x ${result.reason}`);
    if (options.hint) {
      console.log(`    ${options.hint}`);
    }
  }

  console.log(`  Usando el valor por defecto: ${String(options.defaultValue)}.`);
  return options.defaultValue;
}

/**
 * Reads a single key from a closed set of choices.
 *
 * - Enter uses the default choice.
 * - An unknown key prints the valid keys and asks again.
 */
export async function askKeyChoice(options: KeyPromptOptions): Promise<string> {
  const maxAttempts = options.maxAttempts ?? defaultMaxAttempts;
  const defaultChoice =
    options.choices.find((choice) => choice.key === options.defaultKey) ?? options.choices[0];

  if (!defaultChoice) {
    throw new Error('No choices were configured for this prompt.');
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const pressed = (await readKey(options.prompt)).trim().toLowerCase();

    if (pressed === '') {
      return defaultChoice.value;
    }

    const choice = options.choices.find((candidate) => candidate.key === pressed);
    if (choice) {
      return choice.value;
    }

    console.log(`  x Tecla no valida: "${pressed}".`);
    console.log(
      `    Opciones: ${options.choices.map((candidate) => `${candidate.key.toUpperCase()}=${candidate.label}`).join(' · ')}`,
    );
    console.log(`    Enter usa ${defaultChoice.label}.`);
  }

  console.log(`  Usando ${defaultChoice.label}.`);
  return defaultChoice.value;
}

/**
 * Parses a positive integer and accepts common human formats:
 * 100, 1.000, 1,000, 1k, 2.5k.
 */
export function parsePositiveInt(raw: string, maximum = 100_000): ParseResult<number> {
  const text = raw.trim().toLowerCase().replace(/\s+/g, '');

  if (!text) {
    return { ok: false, reason: 'No escribiste ningun numero.' };
  }

  const withThousandsSuffix = text.match(/^(\d+(?:[.,]\d+)?)k$/);
  let value: number;

  if (withThousandsSuffix?.[1]) {
    value = Math.round(Number(withThousandsSuffix[1].replace(',', '.')) * 1000);
  } else {
    const cleaned = text.replace(/[.,](?=\d{3}(?:\D|$))/g, '');
    value = Number(cleaned);
  }

  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    return { ok: false, reason: `"${raw}" no es un numero entero valido.` };
  }

  if (value < 1) {
    return { ok: false, reason: 'El numero debe ser mayor a 0.' };
  }

  if (value > maximum) {
    return { ok: false, reason: `El maximo permitido es ${maximum}.` };
  }

  return { ok: true, value };
}

/**
 * Accepts s/si/sí/y/yes as true and n/no as false.
 */
export function parseYesNo(raw: string): ParseResult<boolean> {
  const normalized = raw
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');

  if (['s', 'si', 'y', 'yes', 'true', '1'].includes(normalized)) {
    return { ok: true, value: true };
  }

  if (['n', 'no', 'false', '0'].includes(normalized)) {
    return { ok: true, value: false };
  }

  return { ok: false, reason: `"${raw}" no es una respuesta valida.` };
}
