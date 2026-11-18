import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer';

export interface BrowserSessionOptions {
  rootDir: string;
  browser?: string;
  profileDir?: string;
  profileName?: string;
  chromeExecutablePath?: string;
  useSystemProfile: boolean;
  noSandbox: boolean;
}

export interface BrowserSession {
  browser: Browser;
  page: Page;
  userDataDir: string;
  profileDirectory?: string;
}

interface ChromeProfileLocation {
  userDataDir: string;
  filesystemUserDataDir: string;
  profileDirectory?: string;
}

interface WindowsDrivePath {
  driveLetter: string;
  drivePath: string;
}

interface WslMountPath {
  driveLetter: string;
  mountPath: string;
}

function createChromeProfileLocation(
  userDataDir: string,
  profileDirectory?: string,
  filesystemUserDataDir = normalizePathForCurrentPlatform(userDataDir),
): ChromeProfileLocation {
  return profileDirectory === undefined
    ? { userDataDir, filesystemUserDataDir }
    : { userDataDir, filesystemUserDataDir, profileDirectory };
}

function expandHome(directory: string): string {
  if (directory === '~') {
    return os.homedir();
  }

  if (directory.startsWith('~/')) {
    return path.join(os.homedir(), directory.slice(2));
  }

  return directory;
}

function parseWindowsDrivePath(candidate: string): WindowsDrivePath | null {
  const match = /^([a-zA-Z]):[\\/](.*)$/.exec(candidate);
  if (!match) {
    return null;
  }

  const [, driveLetter, drivePath] = match;
  if (!driveLetter || drivePath === undefined) {
    return null;
  }

  return { driveLetter, drivePath };
}

function toWslMountPath(windowsPath: WindowsDrivePath): string {
  return `/mnt/${windowsPath.driveLetter.toLowerCase()}/${windowsPath.drivePath.replaceAll('\\', '/')}`;
}

function windowsDrivePathToWslMountPath(candidate: string): string | null {
  const windowsPath = parseWindowsDrivePath(candidate);
  return windowsPath ? toWslMountPath(windowsPath) : null;
}

function parseWslMountPath(candidate: string): WslMountPath | null {
  const match = /^\/mnt\/([a-zA-Z])\/(.*)$/.exec(candidate);
  if (!match) {
    return null;
  }

  const [, driveLetter, mountPath] = match;
  if (!driveLetter || mountPath === undefined) {
    return null;
  }

  return { driveLetter, mountPath };
}

function toWindowsDrivePath(wslPath: WslMountPath): string {
  return path.win32.normalize(
    `${wslPath.driveLetter.toUpperCase()}:\\${wslPath.mountPath.replaceAll('/', '\\')}`,
  );
}

function unescapePosixShellPath(candidate: string): string {
  return candidate.replaceAll(/\\([\s()[\]{}'"$&;|<>?*\\])/g, '$1');
}

function normalizePathForCurrentPlatform(inputPath: string): string {
  const expandedPath = unescapePosixShellPath(expandHome(inputPath.trim()));
  const windowsPath = parseWindowsDrivePath(expandedPath);
  const wslPath = parseWslMountPath(expandedPath);

  if (windowsPath) {
    return process.platform === 'win32'
      ? path.win32.normalize(expandedPath)
      : toWslMountPath(windowsPath);
  }

  if (wslPath && process.platform === 'win32') {
    return toWindowsDrivePath(wslPath);
  }

  return path.isAbsolute(expandedPath) ? expandedPath : path.resolve(expandedPath);
}

function hasPathSeparator(value: string): boolean {
  return /[\\/]/.test(value);
}

function existingEnvPath(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? normalizePathForCurrentPlatform(value) : undefined;
}

function readWindowsEnvironmentPath(name: string): string | undefined {
  if (process.platform === 'win32') {
    return undefined;
  }

  try {
    const value = execFileSync('cmd.exe', ['/c', 'echo', `%${name}%`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .trim()
      .replaceAll('\r', '');

    if (!value || value === `%${name}%`) {
      return undefined;
    }

    return value;
  } catch {
    return undefined;
  }
}

function fromWindowsEnvironmentPath(name: string, ...segments: string[]): string | undefined {
  const directory = readWindowsEnvironmentPath(name);
  return directory ? path.win32.join(directory, ...segments) : undefined;
}

function getWslFilesystemPathForWindowsPath(windowsPath: string): string | undefined {
  return windowsDrivePathToWslMountPath(windowsPath) ?? undefined;
}

function fromEnvPath(name: string, ...segments: string[]): string | undefined {
  const directory = existingEnvPath(name);
  return directory ? path.join(directory, ...segments) : undefined;
}

interface BrowserCandidate {
  id: string;
  name: string;
  executables: string[];
  userDataDirs: string[];
}

function getBrowserCandidates(): BrowserCandidate[] {
  const local = (...segments: string[]): string | undefined =>
    fromEnvPath('LOCALAPPDATA', ...segments);
  const programFiles = (...segments: string[]): string | undefined =>
    fromEnvPath('PROGRAMFILES', ...segments);
  const programFilesX86 = (...segments: string[]): string | undefined =>
    fromEnvPath('PROGRAMFILES(X86)', ...segments);
  const appData = (...segments: string[]): string | undefined => fromEnvPath('APPDATA', ...segments);
  const home = (...segments: string[]): string => path.join(os.homedir(), ...segments);
  const clean = (values: Array<string | undefined>): string[] =>
    values.filter((value): value is string => Boolean(value));

  return [
    {
      id: 'brave',
      name: 'Brave',
      executables: clean([
        local('BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
        programFiles('BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
        programFilesX86('BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
        '/usr/bin/brave-browser',
        '/usr/bin/brave',
        '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
        '/mnt/c/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
      ]),
      userDataDirs: clean([
        local('BraveSoftware', 'Brave-Browser', 'User Data'),
        home('.config', 'BraveSoftware', 'Brave-Browser'),
        home('Library', 'Application Support', 'BraveSoftware', 'Brave-Browser'),
      ]),
    },
    {
      id: 'chrome',
      name: 'Google Chrome',
      executables: clean([
        local('Google', 'Chrome', 'Application', 'chrome.exe'),
        programFiles('Google', 'Chrome', 'Application', 'chrome.exe'),
        programFilesX86('Google', 'Chrome', 'Application', 'chrome.exe'),
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
      ]),
      userDataDirs: clean([
        local('Google', 'Chrome', 'User Data'),
        home('.config', 'google-chrome'),
        home('Library', 'Application Support', 'Google', 'Chrome'),
      ]),
    },
    {
      id: 'edge',
      name: 'Microsoft Edge',
      executables: clean([
        local('Microsoft', 'Edge', 'Application', 'msedge.exe'),
        programFiles('Microsoft', 'Edge', 'Application', 'msedge.exe'),
        programFilesX86('Microsoft', 'Edge', 'Application', 'msedge.exe'),
        '/usr/bin/microsoft-edge',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        '/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      ]),
      userDataDirs: clean([
        local('Microsoft', 'Edge', 'User Data'),
        home('.config', 'microsoft-edge'),
        home('Library', 'Application Support', 'Microsoft Edge'),
      ]),
    },
    {
      id: 'chromium',
      name: 'Chromium',
      executables: clean([
        local('Chromium', 'Application', 'chrome.exe'),
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
      ]),
      userDataDirs: clean([
        local('Chromium', 'User Data'),
        home('.config', 'chromium'),
        home('Library', 'Application Support', 'Chromium'),
      ]),
    },
    {
      id: 'opera',
      name: 'Opera',
      executables: clean([
        local('Programs', 'Opera', 'opera.exe'),
        '/usr/bin/opera',
        '/Applications/Opera.app/Contents/MacOS/Opera',
      ]),
      userDataDirs: clean([
        appData('Opera Software', 'Opera Stable'),
        home('.config', 'opera'),
        home('Library', 'Application Support', 'com.operasoftware.Opera'),
      ]),
    },
    {
      id: 'vivaldi',
      name: 'Vivaldi',
      executables: clean([
        local('Vivaldi', 'Application', 'vivaldi.exe'),
        programFiles('Vivaldi', 'Application', 'vivaldi.exe'),
        '/usr/bin/vivaldi',
        '/Applications/Vivaldi.app/Contents/MacOS/Vivaldi',
      ]),
      userDataDirs: clean([
        local('Vivaldi', 'User Data'),
        home('.config', 'vivaldi'),
        home('Library', 'Application Support', 'Vivaldi'),
      ]),
    },
  ];
}

function detectBrowser(preferred?: string): {
  id: string;
  executable: string | undefined;
  userDataDir: string | undefined;
} | undefined {
  const candidates = getBrowserCandidates();
  const selected =
    preferred && preferred !== 'auto'
      ? candidates.filter((candidate) => candidate.id === preferred)
      : candidates;

  const resolved = selected
    .map((candidate) => ({
      id: candidate.id,
      executable: candidate.executables.find((candidatePath) => fs.existsSync(candidatePath)),
      userDataDir: candidate.userDataDirs.find((candidateDir) => fs.existsSync(candidateDir)),
    }))
    .filter((candidate) => candidate.executable || candidate.userDataDir);

  return (
    resolved.find((candidate) => candidate.executable && candidate.userDataDir) ??
    resolved.find((candidate) => candidate.executable) ??
    resolved[0]
  );
}

export function detectBrowserName(preferred?: string): string | undefined {
  const detected = detectBrowser(preferred);
  if (!detected) {
    return undefined;
  }
  const candidate = getBrowserCandidates().find((browser) => browser.id === detected.id);
  return candidate ? `${candidate.name} (${detected.id})` : detected.id;
}

function findSystemUserDataDir(browser?: string): string | undefined {
  return detectBrowser(browser)?.userDataDir;
}

function findWindowsLocalAppDataDir(): string | undefined {
  const localAppData = fromEnvPath('LOCALAPPDATA');
  if (localAppData && fs.existsSync(localAppData)) {
    const wslPath = parseWslMountPath(localAppData);
    return wslPath ? toWindowsDrivePath(wslPath) : localAppData;
  }

  const windowsLocalAppData = fromWindowsEnvironmentPath('LOCALAPPDATA');
  const windowsLocalAppDataFilesystemPath = windowsLocalAppData
    ? getWslFilesystemPathForWindowsPath(windowsLocalAppData)
    : undefined;

  if (windowsLocalAppDataFilesystemPath && fs.existsSync(windowsLocalAppDataFilesystemPath)) {
    return windowsLocalAppData;
  }

  return undefined;
}

function isWslWindowsExecutable(executablePath: string | undefined): boolean {
  return Boolean(
    executablePath &&
    process.platform !== 'win32' &&
    /^\/mnt\/[a-z]\//i.test(executablePath) &&
    executablePath.toLowerCase().endsWith('.exe'),
  );
}

function getDefaultProfileLocation(
  rootDir: string,
  executablePath: string | undefined,
  profileName: string | undefined,
): ChromeProfileLocation {
  const localAppData = findWindowsLocalAppDataDir();

  if (isWslWindowsExecutable(executablePath) && localAppData) {
    const userDataDir = path.win32.join(
      localAppData,
      'regt-instagram-toolkit',
      'chrome-profile',
    );
    const filesystemUserDataDir = getWslFilesystemPathForWindowsPath(userDataDir);

    if (filesystemUserDataDir) {
      return createChromeProfileLocation(userDataDir, profileName, filesystemUserDataDir);
    }
  }

  return createChromeProfileLocation(path.join(rootDir, '.chrome-profile'), profileName);
}

function isRelativeProfileDir(profileDir: string): boolean {
  const directory = unescapePosixShellPath(expandHome(profileDir.trim()));
  return (
    !path.isAbsolute(directory) &&
    !parseWindowsDrivePath(directory) &&
    !parseWslMountPath(directory)
  );
}

function getWslWindowsRelativeProfileLocation(
  profileDir: string,
  executablePath: string | undefined,
  profileName: string | undefined,
): ChromeProfileLocation | null {
  if (!isWslWindowsExecutable(executablePath) || !isRelativeProfileDir(profileDir)) {
    return null;
  }

  const localAppData = findWindowsLocalAppDataDir();
  if (!localAppData) {
    return null;
  }

  const relativeDirectory = path.win32.normalize(
    unescapePosixShellPath(profileDir.trim()).replaceAll('/', '\\'),
  );

  if (relativeDirectory === '.' || relativeDirectory.startsWith('..')) {
    throw new Error(
      '--profile-dir must point to a profile directory name when using Windows Chrome from WSL2.',
    );
  }

  const userDataDir = path.win32.join(
    localAppData,
    'regt-instagram-toolkit',
    relativeDirectory,
  );
  const filesystemUserDataDir = getWslFilesystemPathForWindowsPath(userDataDir);

  if (!filesystemUserDataDir) {
    return null;
  }

  return createChromeProfileLocation(userDataDir, profileName, filesystemUserDataDir);
}

function isChromeProfileDirectoryName(profileName: string): boolean {
  return (
    profileName === 'Default' ||
    profileName === 'Guest Profile' ||
    profileName === 'System Profile' ||
    /^Profile \d+$/.test(profileName)
  );
}

function isChromeProfileSubdirectory(directory: string): boolean {
  const profileName = path.basename(directory);
  const parentDirectory = path.dirname(directory);

  return (
    isChromeProfileDirectoryName(profileName) &&
    fs.existsSync(path.join(parentDirectory, 'Local State'))
  );
}

function resolveChromeProfileLocation(
  rootDir: string,
  profileDir: string | undefined,
  profileName: string | undefined,
  useSystemProfile: boolean,
  executablePath: string | undefined,
  browser?: string,
): ChromeProfileLocation {
  if (profileDir) {
    const systemUserDataDir = findSystemUserDataDir(browser);
    if (
      !hasPathSeparator(profileDir) &&
      isChromeProfileDirectoryName(profileDir) &&
      systemUserDataDir
    ) {
      return createChromeProfileLocation(systemUserDataDir, profileDir);
    }

    const wslWindowsProfileLocation = getWslWindowsRelativeProfileLocation(
      profileDir,
      executablePath,
      profileName,
    );

    if (wslWindowsProfileLocation) {
      return wslWindowsProfileLocation;
    }

    const resolvedProfileDir = normalizePathForCurrentPlatform(profileDir);

    if (isChromeProfileSubdirectory(resolvedProfileDir)) {
      return createChromeProfileLocation(
        path.dirname(resolvedProfileDir),
        path.basename(resolvedProfileDir),
      );
    }

    return createChromeProfileLocation(resolvedProfileDir, profileName);
  }

  if (useSystemProfile) {
    const systemUserDataDir = findSystemUserDataDir(browser);
    return systemUserDataDir
      ? createChromeProfileLocation(systemUserDataDir, profileName)
      : getDefaultProfileLocation(rootDir, executablePath, profileName);
  }

  return getDefaultProfileLocation(rootDir, executablePath, profileName);
}

function findSystemChromeExecutable(browser?: string): string | undefined {
  return detectBrowser(browser)?.executable;
}

function resolveChromeExecutablePath(
  chromeExecutablePath?: string,
  browser?: string,
): string | undefined {
  if (!chromeExecutablePath) {
    return findSystemChromeExecutable(browser);
  }

  const resolvedPath = normalizePathForCurrentPlatform(chromeExecutablePath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Chrome executable was not found: ${resolvedPath}`);
  }

  return resolvedPath;
}

export async function launchBrowser(options: BrowserSessionOptions): Promise<BrowserSession> {
  const executablePath = resolveChromeExecutablePath(
    options.chromeExecutablePath,
    options.browser,
  );
  const { filesystemUserDataDir, profileDirectory, userDataDir } = resolveChromeProfileLocation(
    options.rootDir,
    options.profileDir,
    options.profileName,
    options.useSystemProfile,
    executablePath,
    options.browser,
  );
  fs.mkdirSync(filesystemUserDataDir, { recursive: true });

  const browser = await puppeteer
    .launch({
      headless: false,
      defaultViewport: null,
      ...(executablePath ? { executablePath } : {}),
      userDataDir,
      args: [
        '--start-maximized',
        '--disable-dev-shm-usage',
        '--lang=en-US,fr-FR',
        ...(profileDirectory ? [`--profile-directory=${profileDirectory}`] : []),
        ...(options.noSandbox ? ['--no-sandbox', '--disable-setuid-sandbox'] : []),
      ],
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);

      const lowerMessage = message.toLowerCase();

      if (lowerMessage.includes('singleton') || lowerMessage.includes('ws endpoint')) {
        throw new Error(
          `Chrome could not be controlled with profile: ${userDataDir}. This usually happens when the system Chrome profile is already open and Chrome redirects Puppeteer to the existing browser session. Close every Chrome window using this profile, or run with --profile-dir .chrome-profile.`,
        );
      }

      throw error;
    });

  const pages = await browser.pages();
  const page = pages[0] ?? (await browser.newPage());
  page.setDefaultTimeout(30_000);

  return profileDirectory === undefined
    ? { browser, page, userDataDir }
    : { browser, page, userDataDir, profileDirectory };
}
