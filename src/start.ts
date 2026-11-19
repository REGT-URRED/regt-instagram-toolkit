#!/usr/bin/env node

import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { detectBrowserId, detectBrowserName } from './browser/launchBrowser.js';
import { enableUtf8Console } from './utils/consoleEncoding.js';
import { readKey, readLine } from './utils/prompt.js';

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

const browserLabels: Record<string, string> = {
  auto: 'automático',
  brave: 'Brave',
  chrome: 'Chrome',
  edge: 'Edge',
  opera: 'Opera',
  vivaldi: 'Vivaldi',
};

async function main(): Promise<void> {
  enableUtf8Console();

  const detectedId = detectBrowserId();
  const detectedName = detectBrowserName();
  const detectedLabel = detectedId
    ? `${browserLabels[detectedId] ?? detectedName ?? detectedId} · detectado`
    : 'no detectado (se usará el integrado)';

  console.log('');
  console.log('  REGT Instagram Toolkit');
  console.log(`  Navegador: ${detectedLabel}`);
  console.log('');
  console.log('  1) Limpiar likes');
  console.log('  2) Limpiar comentarios');
  console.log('  3) Bloquear cuentas de anuncios');
  console.log('  4) Salir');
  console.log('');

  const choice = (await readLine('  Opción [1-4]: ')).trim();
  if (choice === '4' || choice === '') {
    return;
  }

  if (choice !== '1' && choice !== '2' && choice !== '3') {
    console.log('  Opción no válida.');
    return;
  }

  const selectedBrowserDefault = detectedId ?? 'auto';
  const defaultKey =
    Object.entries(browserChoices).find(([, value]) => value === selectedBrowserDefault)?.[0] ?? 'a';

  console.log('');
  console.log('  Navegador:');
  console.log('    a) automático   b) Brave   c) Chrome   e) Edge   o) Opera   v) Vivaldi');
  console.log(
    `    predeterminado: ${browserLabels[selectedBrowserDefault] ?? selectedBrowserDefault} · tecla ${defaultKey.toUpperCase()} (o Enter)`,
  );
  console.log('  Escribe una letra, sin Enter:');

  const browserKey = await readKey('  > ');
  const selectedBrowser = browserChoices[browserKey] ?? selectedBrowserDefault;
  console.log(`  Navegador elegido: ${browserLabels[selectedBrowser] ?? selectedBrowser}`);

  console.log('');
  console.log('  Aviso: si usas tu perfil real, la herramienta tomará tu sesión de Instagram');
  console.log('  y conviene que no tengas el navegador abierto durante la ejecución.');
  console.log('');

  const profileAnswer = (
    await readLine('  ¿Usar tu perfil del navegador actual (sesión iniciada)? [s/N]: ')
  ).toLowerCase();
  const useSystemProfile = profileAnswer === 's' || profileAnswer === 'si' || profileAnswer === 'sí';

  let args: string[] = [];
  if (choice === '1' || choice === '2') {
    const answer = (await readLine('  ¿Máximo por lote? [20] (lotes aleatorios): ')).trim();
    const requested = Math.max(1, Number(answer) || 20);

    if (choice === '1') {
      const maxBatch = Math.min(95, Math.max(20, requested));
      args = ['--likes', '--batch-size', `20:${maxBatch}`];
    } else {
      const maxBatch = Math.min(60, Math.max(1, requested));
      args = ['--hybrid', '--comments', '--limit', String(maxBatch), '--hybrid-passes', '0'];
    }
  } else {
    args = ['--block-accounts'];
  }

  if (selectedBrowser !== 'auto') {
    args.push('--browser', selectedBrowser);
  }
  if (useSystemProfile) {
    args.push('--use-system-profile');
  }

  if (process.env['REGT_TRANSLATIONS']) {
    args.push('--translations', process.env['REGT_TRANSLATIONS']);
  } else if (process.env['REGT_LOCALE']?.startsWith('es')) {
    args.push('--translations', './translations/es.json');
  }
  args.push('--close-on-finish');

  console.log('');
  console.log(`  Ejecutando: ${args.join(' ')}`);
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
