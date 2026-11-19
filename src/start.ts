#!/usr/bin/env node

import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { detectBrowserName } from './browser/launchBrowser.js';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(rootDirectory, 'dist', 'cli.js');

const browserChoices: Record<string, string> = {
  a: 'auto',
  b: 'brave',
  c: 'chrome',
  e: 'edge',
  o: 'opera',
  v: 'vivaldi',
};

function askSingleKey(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once('data', (key: Buffer) => {
      process.stdin.pause();
      process.stdin.setRawMode(false);
      const char = key.toString().toLowerCase().trim();
      process.stdout.write(char + '\n');
      resolve(char);
    });
  });
}

async function main(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const detected = detectBrowserName();
  const browser = detected ? `${detected} · automático` : 'no detectado (se usará el integrado)';

  console.log('');
  console.log('  REGT Instagram Toolkit');
  console.log(`  Navegador: ${browser}`);
  console.log('');
  console.log('  1) Limpiar likes');
  console.log('  2) Limpiar comentarios');
  console.log('  3) Bloquear cuentas de anuncios');
  console.log('  4) Salir');
  console.log('');

  const choice = (await rl.question('  Opción [1-4]: ')).trim();
  if (choice === '4' || choice === '') {
    rl.close();
    return;
  }

  // --- Selección de navegador (una sola letra, enter automático) ---
  const selectedBrowserDefault = detected || 'auto';
  const defaultKey = Object.entries(browserChoices).find(([, v]) => v === selectedBrowserDefault)?.[0] || 'a';

  console.log('');
  console.log('  Navegador:');
  console.log(`    a) auto   b) brave   c) chrome   e) edge   o) opera   v) vivaldi`);
  console.log(`    (predeterminado: ${selectedBrowserDefault} · tecla: ${defaultKey})`);
  console.log('  Escribe una letra y presiona Enter:');

  const browserKey = (await askSingleKey('  > ')).toLowerCase();
  const selectedBrowser = browserChoices[browserKey] ?? selectedBrowserDefault;

  console.log('');
  console.log('  ⚠ Si eliges tu perfil real del navegador, la herramienta usará la pestaña');
  console.log('    original donde ya iniciaste sesión en Instagram.');
  console.log('    Te recomendamos usar otro navegador mientras la herramienta trabaja.');
  console.log('');
  const profileAnswer = (
    await rl.question('  ¿Usar tu perfil del navegador actual (sesión iniciada)? [s/N]: ')
  ).trim();
  const useSystemProfile =
    profileAnswer.toLowerCase() === 's' || profileAnswer.toLowerCase() === 'si';

  let args: string[] = [];
  if (choice === '1' || choice === '2') {
    const answer = (
      await rl.question('  ¿Máximo por lote? [20] (lotes aleatorios): ')
    ).trim();
    const requested = Math.max(1, Number(answer) || 20);
    if (choice === '1') {
      // Likes: random batch between 20 and the chosen maximum (UI caps ~95).
      const maxBatch = Math.min(95, Math.max(20, requested));
      args = ['--likes', '--batch-size', `20:${maxBatch}`];
    } else {
      // Comments: random batch between 20 and the chosen maximum (cap 60).
      const maxBatch = Math.min(60, Math.max(1, requested));
      args = ['--hybrid', '--comments', '--limit', String(maxBatch), '--hybrid-passes', '0'];
    }
  } else if (choice === '3') {
    args = ['--block-accounts'];
  } else {
    rl.close();
    console.log('  Opción no válida.');
    return;
  }

  if (selectedBrowser && selectedBrowser !== 'auto') {
    args.push('--browser', selectedBrowser);
  }
  if (useSystemProfile) {
    args.push('--use-system-profile');
  }

  rl.close();
  if (process.env['REGT_TRANSLATIONS']) {
    args.push('--translations', process.env['REGT_TRANSLATIONS']);
  } else if (process.env['REGT_LOCALE']?.startsWith('es')) {
    args.push('--translations', './translations/es.json');
  }
  args.push('--close-on-finish');

  console.log('');
  const exitCode = await new Promise<number>((resolve) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: rootDirectory,
      stdio: 'inherit',
    });
    child.on('exit', (code) => resolve(code ?? 0));
  });

  console.log(exitCode === 0 ? '\n  Listo.' : `\n  Terminó con código ${exitCode}.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
