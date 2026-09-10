#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
assert.equal(config.identifier, 'com.hoverthought.hud', 'Installed application identity must remain stable');
assert.equal(config.bundle.windows.wix.upgradeCode, 'a920a0e7-bebf-5189-bf5f-b75077bb8aeb', 'WiX upgradeCode must remain stable across upgrades');
assert.equal(config.bundle.active, true, 'Release packaging must remain enabled');
assert.equal(config.bundle.targets, 'all', 'Release packaging must retain all platform installers');
console.log('Release continuity checks passed: application identity, WiX upgradeCode and installer targets.');
