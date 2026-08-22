import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';

export interface SizePreset {
  key: string;
  label: string;
  width: number;
  height: number;
  /** Maximize instead of applying width/height. */
  maximize?: boolean;
}

export const SIZE_PRESETS: SizePreset[] = [
  { key: 'mini', label: 'Mini', width: 240, height: 160 },
  { key: 'compact', label: 'Compact', width: 340, height: 260 },
  { key: 'standard', label: 'Standard', width: 480, height: 380 },
  { key: 'full', label: 'Full screen', width: 0, height: 0, maximize: true },
];

export async function applySizePreset(preset: SizePreset): Promise<void> {
  const win = getCurrentWindow();
  if (preset.maximize) {
    await win.maximize();
    return;
  }
  if (await win.isMaximized()) await win.unmaximize();
  await win.setSize(new LogicalSize(preset.width, preset.height));
}
