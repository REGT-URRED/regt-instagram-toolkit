#!/usr/bin/env node

import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { detectBrowserName } from './browser/launchBrowser.js';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(rootDirectory, 'dist', 'cli.js');

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

  // --- Selección de navegador y perfil ---
  const selectedBrowserDefault = detected || 'auto';
  const browserAnswer = (
    await rl.question(`  Navegador [${selectedBrowserDefault}/brave/chrome/edge/opera/vivaldi] (${selectedBrowserDefault}): `)
  ).trim();
  const selectedBrowser = browserAnswer || selectedBrowserDefault;

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
    const answer = (await rl.question('  ¿Cuántos por lote? [20]: ')).trim();
    const limit = Math.max(1, Math.min(95, Number(answer) || 20));
    args =
      choice === '1'
        ? ['--likes', '--limit', String(limit)]
        : ['--hybrid', '--comments', '--limit', String(limit), '--hybrid-passes', '0'];
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
