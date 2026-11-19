import { spawnSync } from 'node:child_process';
import process from 'node:process';

export function enableUtf8Console(): void {
  if (process.platform !== 'win32') {
    return;
  }

  try {
    // `chcp` must inherit the console handles to affect the current console;
    // its own output is redirected to nul so the prompt stays clean.
    spawnSync(process.env['ComSpec'] ?? 'cmd.exe', ['/d', '/c', 'chcp 65001 >nul'], {
      stdio: 'inherit',
      windowsHide: true,
    });
  } catch {
    // Codepage setup is best-effort; the tool still works without it.
  }
}
