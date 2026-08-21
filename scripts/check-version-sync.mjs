#!/usr/bin/env node
/**
 * Keeps the three version declarations in step.
 *
 * Cargo.toml is what `app.package_info().version` returns, and therefore what
 * Settings displays. tauri.conf.json is what the installer stamps. package.json
 * is cosmetic but confusing when stale — it sat at 0.1.0 through eight releases.
 *
 * If these drift, Settings reports a different version than the thing the user
 * installed, which defeats the entire point of showing it.
 */
import { readFileSync } from 'node:fs';

const cargo = readFileSync('src-tauri/Cargo.toml', 'utf8').match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const tauri = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')).version;
const pkg = JSON.parse(readFileSync('package.json', 'utf8')).version;

const found = { 'src-tauri/Cargo.toml': cargo, 'src-tauri/tauri.conf.json': tauri, 'package.json': pkg };
const unique = [...new Set(Object.values(found))];

if (unique.length !== 1 || !unique[0]) {
  console.error('Version mismatch:');
  for (const [file, version] of Object.entries(found)) {
    console.error(`  ${version ?? '(unreadable)'}  ${file}`);
  }
  process.exit(1);
}

console.log(`Version check passed: all three declare ${unique[0]}.`);
