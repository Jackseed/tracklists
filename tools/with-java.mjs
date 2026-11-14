#!/usr/bin/env node
/**
 * Runs a command with a JDK 21+ first on the PATH.
 *
 * The Firebase emulators (firebase-tools 15+) refuse older Java versions. On
 * machines where the default `java` is older but a newer JDK is installed
 * (e.g. Homebrew's keg-only openjdk), this picks the newer one.
 *   node tools/with-java.mjs firebase emulators:start
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const MIN_VERSION = 21;

function findJavaBin() {
  const candidates = [];
  if (process.env.JAVA_HOME) candidates.push(path.join(process.env.JAVA_HOME, 'bin'));
  for (const prefix of ['/opt/homebrew/opt', '/usr/local/opt']) {
    for (const keg of ['openjdk', 'openjdk@25', 'openjdk@21']) candidates.push(path.join(prefix, keg, 'bin'));
  }
  if (process.platform === 'darwin') {
    try {
      const home = execFileSync('/usr/libexec/java_home', ['-v', `${MIN_VERSION}+`], { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
      if (home) candidates.push(path.join(home, 'bin'));
    } catch {
      // No matching JDK registered with macOS.
    }
  }
  return candidates.find((dir) => existsSync(path.join(dir, 'java')) && version(dir) >= MIN_VERSION);
}

function version(binDir) {
  const result = spawnSyncVersion(binDir);
  return Number(/version "(\d+)/.exec(result)?.[1] ?? 0);
}
function spawnSyncVersion(binDir) {
  try {
    // 2>&1: the version banner goes to stderr.
    return execFileSync('/bin/sh', ['-c', `"${binDir ? path.join(binDir, 'java') : 'java'}" -version 2>&1`], { encoding: 'utf8' });
  } catch {
    return '';
  }
}

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error('Usage: node tools/with-java.mjs <command> [args...]');
  process.exit(2);
}
const env = { ...process.env };
if (version('') < MIN_VERSION) {
  const bin = findJavaBin();
  if (bin) {
    env.PATH = `${bin}${path.delimiter}${env.PATH}`;
    env.JAVA_HOME = path.dirname(bin);
  } else {
    console.error(`\nThe Firebase emulators need Java ${MIN_VERSION}+ and none was found (default java: ${version('') || 'none'}).`);
    console.error('Install one, e.g. `brew install openjdk@21`, or set JAVA_HOME.\n');
    process.exit(1);
  }
}
const child = spawn(command, args, { stdio: 'inherit', env, shell: process.platform === 'win32' });
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
