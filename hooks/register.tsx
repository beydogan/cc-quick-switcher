import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Native, PresetId } from '../types'

type Preset = { id: PresetId; label: string; hotkey: string; family: string; model: string; effort: 'medium' | 'high' }

const PRESETS: Preset[] = [
  { id: 'om', label: 'Opus Medium', hotkey: '1', family: 'opus', model: 'claude-opus-5-5', effort: 'medium' },
  { id: 'oh', label: 'Opus High', hotkey: '2', family: 'opus', model: 'claude-opus-5-5', effort: 'high' },
  { id: 'fm', label: 'Fable Medium', hotkey: '3', family: 'fable', model: 'claude-fable-5-2', effort: 'medium' },
  { id: 'fh', label: 'Fable High', hotkey: '4', family: 'fable', model: 'claude-fable-5-2', effort: 'high' },
]

const STORE_KEY = 'preset'
const preset = atom({ plugin: 'model-switcher', key: 'preset' } as const, null)
const native = atom({ plugin: 'model-switcher', key: 'native' } as const, null)

const isPresetId = (v: unknown): v is PresetId => PRESETS.some(p => p.id === v)

const matchNative = (n: Native | null) =>
  n ? PRESETS.find(p => n.model.toLowerCase().includes(p.family) && n.effort === p.effort) : undefined

const setNative = async ($: EngineInterface, next: Native) => {
  const cur = await read($, native)
  if (cur?.model === next.model && cur?.effort === next.effort) return
  await update($, native, () => next)
}

const settingsEffort = async ($: EngineInterface, model: string) => {
  const perModel = await $.settings.read({ key: 'modelSettings' })
  const family = PRESETS.find(p => model.toLowerCase().includes(p.family))
  const ids = [model, model.replace(/\[.*\]$/, ''), family?.model].filter((x): x is string => !!x)
  if (perModel && typeof perModel === 'object') {
    for (const id of ids) {
      const level = (perModel as Record<string, { effortLevel?: unknown } | undefined>)[id]?.effortLevel
      if (typeof level === 'string') return level
    }
  }
  const top = await $.settings.read({ key: 'effortLevel' })
  return typeof top === 'string' ? top : null
}

const refreshNative = async ($: EngineInterface) => {
  const model = await $.session.model()
  const effort = await settingsEffort($, model)
  const cur = await read($, native)
  await setNative($, { model, effort: effort ?? cur?.effort ?? null })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const saved = await $.store.get(STORE_KEY)
    if (isPresetId(saved)) await update($, preset, () => saved)
    await refreshNative($)
    return next(e)
  })

  on('command.run', async ($, e, next) => {
    const result = await next(e)
    await refreshNative($)
    return result
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) return yield* next(e)
    await setNative($, { model: e.model, effort: typeof e.effort === 'string' ? e.effort : null })
    const id = await read($, preset)
    const p = PRESETS.find(x => x.id === id)
    return yield* next(p ? { ...e, model: p.model, effort: p.effort } : e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const picked = await read($, preset)
    const nat = await read($, native)
    const natPreset = matchNative(nat)
    const effective = picked ?? natPreset?.id
    const { Box, Button, Text } = $.ui.resolve(e)

    const choose = async (id: PresetId) => {
      const nextId = picked === id ? null : id
      await update($, preset, () => nextId)
      await $.store.set(STORE_KEY, nextId)
      $.ui.toast(nextId ? `Model: ${PRESETS.find(p => p.id === nextId)!.label}` : 'Model: native setting')
    }

    const natLabel = natPreset?.label ?? (nat ? `${nat.model}${nat.effort ? ` ${nat.effort}` : ''}` : 'unknown')
    const status = picked ? `override · native: ${natLabel}` : `native: ${natLabel}`

    return (
      <Box>
        <Text dimColor>Model </Text>
        {PRESETS.map(p => (
          <Button
            key={p.id}
            label={effective === p.id ? `● ${p.label}` : p.label}
            hotkey={p.hotkey}
            variant={effective === p.id ? 'primary' : undefined}
            dimColor={effective !== p.id}
            onPress={() => choose(p.id)}
          />
        ))}
        <Text dimColor> {status}</Text>
      </Box>
    )
  })
}
