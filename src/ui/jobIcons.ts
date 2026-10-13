import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { forgetProject as forget, withDefaults, type Assignments, type IconRef } from '../core/icons'
import { settings } from '../core/storage'
import type { Check } from '../core/types'

// Which icon each check has, and the user's uploaded icons. Loaded once,
// shared by the list, the check page and the icon picker; saved as settings
// whenever they change.

export interface IconsState {
  loaded: boolean
  assigned: Assignments
  custom: Record<string, string> // id -> data URL
  /** Give checks without an icon their default (and with `prune`, forget
   *  icons of the project's checks that are gone). */
  ensure: (projectId: string, checks: Check[], prune?: boolean) => void
  set: (key: string, ref: IconRef) => void
  addCustom: (dataUrl: string) => string
  /** Delete an uploaded icon; checks using it get their default again. */
  removeCustom: (id: string) => void
  forgetProject: (projectId: string) => void
}

export const IconsContext = createContext<IconsState>({
  loaded: false,
  assigned: {},
  custom: {},
  ensure: () => {},
  set: () => {},
  addCustom: () => '',
  removeCustom: () => {},
  forgetProject: () => {},
})
export const useIcons = () => useContext(IconsContext)

function parse<T>(raw: string | null): T | undefined {
  try {
    return raw ? (JSON.parse(raw) as T) : undefined
  } catch {
    return undefined
  }
}

export function useIconsState(): IconsState {
  const [loaded, setLoaded] = useState(false)
  const [assigned, setAssigned] = useState<Assignments>({})
  const [custom, setCustom] = useState<Record<string, string>>({})
  const saved = useRef({ assigned: '', custom: '' })

  useEffect(() => {
    void Promise.all([settings.get('icons.assigned'), settings.get('icons.custom')]).then(([a, c]) => {
      setAssigned(parse<Assignments>(a) ?? {})
      setCustom(parse<Record<string, string>>(c) ?? {})
      saved.current = { assigned: a ?? '{}', custom: c ?? '{}' }
      setLoaded(true)
    })
  }, [])

  // Save what changed (after the first load).
  useEffect(() => {
    if (!loaded) return
    const a = JSON.stringify(assigned)
    if (a !== saved.current.assigned) {
      saved.current.assigned = a
      void settings.set('icons.assigned', a).catch(() => {})
    }
    const c = JSON.stringify(custom)
    if (c !== saved.current.custom) {
      saved.current.custom = c
      void settings.set('icons.custom', c).catch(() => {})
    }
  }, [loaded, assigned, custom])

  const ensure = useCallback((projectId: string, checks: Check[], prune = false) => {
    setAssigned((cur) => withDefaults(cur, projectId, checks, prune))
  }, [])
  const set = useCallback((key: string, ref: IconRef) => setAssigned((cur) => ({ ...cur, [key]: ref })), [])
  const addCustom = useCallback((dataUrl: string) => {
    const id = Math.random().toString(36).slice(2, 10)
    setCustom((cur) => ({ ...cur, [id]: dataUrl }))
    return id
  }, [])
  const removeCustom = useCallback((id: string) => {
    setCustom(({ [id]: _gone, ...rest }) => rest)
    setAssigned((cur) => Object.fromEntries(Object.entries(cur).filter(([, ref]) => ref !== `custom:${id}`)))
  }, [])
  const forgetProject = useCallback((projectId: string) => setAssigned((cur) => forget(cur, projectId)), [])

  return useMemo(
    () => ({ loaded, assigned, custom, ensure, set, addCustom, removeCustom, forgetProject }),
    [loaded, assigned, custom, ensure, set, addCustom, removeCustom, forgetProject],
  )
}
