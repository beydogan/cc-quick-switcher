export type PresetId = 'om' | 'oh' | 'fm' | 'fh'
export type Native = { model: string; effort: string | null }

declare module 'claude-code' {
  interface PluginState {
    'model-switcher': { preset: PresetId | null; native: Native | null }
  }
}
