#!/usr/bin/env node

import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { detectBrowserId, detectBrowserName } from './browser/launchBrowser.js';
import { enableUtf8Console } from './utils/consoleEncoding.js';
import { askKeyChoice, askValidated, parsePositiveInt, parseYesNo } from './utils/menuPrompt.js';
import { readLine } from './utils/prompt.js';

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

const menuChoices = ['1', '2', '3', '4'] as const;
type MenuChoice = (typeof menuChoices)[number];

function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

async function askMenuChoice(): Promise<MenuChoice> {
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const raw = (await readLine('  Opción [1-4]: ')).trim();

    if (raw === '') {
      if (!isInteractive()) {
        return '4';
      }

      console.log('  No escribiste nada. Opciones: 1, 2, 3 o 4.');
      continue;
    }

    if ((menuChoices as readonly string[]).includes(raw)) {
      return raw as MenuChoice;
    }

    console.log(`  x "${raw}" no es una opción válida.`);
    console.log('    Opciones: 1 likes · 2 comentarios · 3 bloquear · 4 salir');
  }

  console.log('  Demasiados intentos inválidos. Saliendo.');
  return '4';
}

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

  const choice = await askMenuChoice();
  if (choice === '4') {
    console.log('  Hasta luego.');
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

  const selectedBrowser = await askKeyChoice({
    prompt: '  > ',
    choices: Object.entries(browserChoices).map(([key, value]) => ({
      key,
      value,
      label: browserLabels[value] ?? value,
    })),
    defaultKey,
  });
  console.log(`  Navegador elegido: ${browserLabels[selectedBrowser] ?? selectedBrowser}`);

  console.log('');
  console.log('  Aviso: si usas tu perfil real, la herramienta tomará tu sesión de Instagram');
  console.log('  y conviene que no tengas el navegador abierto durante la ejecución.');
  console.log('');

  const useSystemProfile = await askValidated<boolean>({
    prompt: '  ¿Usar tu perfil del navegador actual (sesión iniciada)? [s/N]: ',
    defaultValue: false,
    parse: parseYesNo,
    hint: 'Respondé S (sí) o N (no). Enter usa N.',
  });

  let args: string[] = [];
  if (choice === '1' || choice === '2') {
    const perBatchCap = choice === '1' ? 95 : 60;
    console.log('  Meta total a eliminar. El tamaño de cada lote se calcula solo');
    console.log(`  (hasta ${perBatchCap} por lote) hasta llegar a la meta.`);

    const requested = await askValidated<number>({
      prompt: '  ¿Cuántos querés eliminar en total? [20]: ',
      defaultValue: 20,
      parse: (raw) => parsePositiveInt(raw, 100_000),
      hint: 'Escribí un número mayor a 0, por ejemplo 100, 500 o 1k. Enter usa 20.',
    });
    console.log(`  Meta: ${requested} · lotes de hasta ${perBatchCap}.`);

    if (choice === '1') {
      args = ['--likes', '--goal', String(requested), '--batch-size', `20:${perBatchCap}`];
    } else {
      args = [
        '--hybrid',
        '--comments',
        '--goal',
        String(requested),
        '--limit',
        String(perBatchCap),
        '--hybrid-passes',
        '0',
      ];
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
    child.on('error', (error) => {
      console.log(`  No se pudo iniciar la limpieza: ${error.message}`);
      resolve(1);
    });
    child.on('exit', (code) => resolve(code ?? 0));
  });

  if (exitCode === 0) {
    console.log('\n  Listo.');
    return;
  }

  console.log(`\n  Terminó con código ${exitCode}.`);
  console.log('  Leé el mensaje de arriba; si fue un límite temporal de Instagram,');
  console.log('  esperá entre 1 y 24 horas y volvé a ejecutar iniciar.cmd.');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n  Ocurrió un problema inesperado: ${message}`);
  console.error('  Volvé a ejecutar iniciar.cmd. Si sigue pasando, revisá que Node.js esté instalado.');
  process.exitCode = 1;
});
