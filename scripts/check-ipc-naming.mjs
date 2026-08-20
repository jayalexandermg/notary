#!/usr/bin/env node
/**
 * Guards the frontend/Rust IPC argument naming contract.
 *
 * Every Tauri command in this app is declared `rename_all = "snake_case"`, so
 * the keys passed to `invoke()` must be snake_case too. Getting this wrong does
 * not fail the build and does not throw at runtime — optional arguments simply
 * deserialize to `None`, so the call silently does nothing. That bug shipped
 * once already (note position, size and pin state stopped persisting), so it is
 * worth a cheap check rather than another round of field reports.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : full;
  });
}

const files = walk('src').filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
const invokeCall = /invoke[^(]*\(\s*['"]([a-z_]+)['"]\s*,\s*\{([^}]*)\}/gs;
const problems = [];

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  for (const [, command, argBlock] of source.matchAll(invokeCall)) {
    for (const [, key] of argBlock.matchAll(/(?:^|,)\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?::|,|$)/g)) {
      if (/[A-Z]/.test(key)) {
        problems.push(`${file}: invoke('${command}') passes "${key}" — commands expect snake_case`);
      }
    }
  }
}

if (problems.length) {
  console.error('IPC naming check failed:\n' + problems.map((p) => '  ' + p).join('\n'));
  process.exit(1);
}
console.log(`IPC naming check passed (${files.length} files scanned).`);
