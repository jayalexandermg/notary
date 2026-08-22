import { useCallback, useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getSetting, setGlobalHotkeys as saveGlobalHotkeys, setSetting } from '../lib/tauri';
import {
  DEFAULT_GLOBAL_HOTKEYS,
  DEFAULT_KEYMAP,
  GlobalHotkeys,
  Keymap,
  parseGlobalHotkeys,
  parseKeymap,
} from '../lib/keybindings';

/**
 * Settings that apply to every note window at once — keybindings, global
 * hotkeys, and "universal mode" (opacity/color/size changes broadcast to
 * every open note). Persisted in the shared settings table and re-broadcast
 * over Tauri events so every window stays in sync without a restart.
 */
export function useSharedSettings() {
  const [keymap, setKeymapState] = useState<Keymap>(DEFAULT_KEYMAP);
  const [globalHotkeys, setGlobalHotkeysState] = useState<GlobalHotkeys>(DEFAULT_GLOBAL_HOTKEYS);
  const [universalMode, setUniversalModeState] = useState(false);
  const [autoStamp, setAutoStampState] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [km, gh, um, as] = await Promise.all([
          getSetting('keymap'),
          getSetting('global_hotkeys'),
          getSetting('universal_mode'),
          getSetting('auto_stamp_default'),
        ]);
        setKeymapState(parseKeymap(km));
        setGlobalHotkeysState(parseGlobalHotkeys(gh));
        setUniversalModeState(um === 'true');
        setAutoStampState(as === 'true');
      } catch (e) {
        console.error('Failed to load shared settings:', e);
      }
    })();
  }, []);

  useEffect(() => {
    const unlistenPromises = [
      listen<string>('keymap-changed', (e) => setKeymapState(parseKeymap(e.payload))),
      listen<string>('global-hotkeys-changed', (e) => setGlobalHotkeysState(parseGlobalHotkeys(e.payload))),
      listen<boolean>('universal-mode-changed', (e) => setUniversalModeState(e.payload)),
    ];
    return () => {
      unlistenPromises.forEach((p) => p.then((fn) => fn()));
    };
  }, []);

  const setKeymap = useCallback(async (next: Keymap) => {
    setKeymapState(next);
    const json = JSON.stringify(next);
    await setSetting('keymap', json);
  }, []);

  const setGlobalHotkeys = useCallback(async (next: GlobalHotkeys) => {
    setGlobalHotkeysState(next);
    await saveGlobalHotkeys(next.newNote, next.toggleAll);
  }, []);

  const setUniversalMode = useCallback(async (value: boolean) => {
    setUniversalModeState(value);
    await setSetting('universal_mode', value ? 'true' : 'false');
  }, []);

  const setAutoStampDefault = useCallback(async (value: boolean) => {
    setAutoStampState(value);
    await setSetting('auto_stamp_default', value ? 'true' : 'false');
  }, []);

  return {
    keymap,
    setKeymap,
    globalHotkeys,
    setGlobalHotkeys,
    universalMode,
    setUniversalMode,
    autoStampDefault: autoStamp,
    setAutoStampDefault,
  };
}
