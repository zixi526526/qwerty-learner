import { getProfileScopedStorageKey } from './storage'

type SyncDocument = {
  revision: number
  payload: Record<string, unknown>
}

type SettingsSyncContext = {
  enabled: boolean
  namespace: string | null
  revision: number
  payload: Record<string, unknown>
  isHydrating: boolean
  pendingTimer: number | null
  retrying: boolean
  dirtyKeys: Record<string, number>
  changeSequence: number
  inFlight: boolean
}

const SYNCED_SETTING_KEYS = [
  'currentDict',
  'currentChapter',
  'loopWordConfig',
  'keySoundsConfig',
  'hintSoundsConfig',
  'pronunciation',
  'fontsize',
  'randomConfig',
  'isShowPrevAndNextWord',
  'isIgnoreCase',
  'isShowAnswerOnHover',
  'isTextSelectable',
  'reviewModeInfo',
  'phoneticConfig',
  'isOpenDarkModeAtom',
  'wordDictationConfig',
  'hasSeenEnhancedPromotion',
  'donateDate',
] as const

let settingsSyncContext: SettingsSyncContext = {
  enabled: false,
  namespace: null,
  revision: 0,
  payload: {},
  isHydrating: false,
  pendingTimer: null,
  retrying: false,
  dirtyKeys: {},
  changeSequence: 0,
  inFlight: false,
}

function isBrowser() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function clearPendingTimer() {
  if (settingsSyncContext.pendingTimer !== null && typeof window !== 'undefined') {
    window.clearTimeout(settingsSyncContext.pendingTimer)
  }
  settingsSyncContext.pendingTimer = null
}

function readStorageValue(key: string, namespace: string) {
  if (!isBrowser()) {
    return undefined
  }

  const rawValue = window.localStorage.getItem(getProfileScopedStorageKey(key, namespace))
  if (rawValue === null) {
    return undefined
  }

  try {
    return JSON.parse(rawValue)
  } catch {
    return undefined
  }
}

async function putSettings(payload: SyncDocument) {
  const response = await fetch('/api/sync/settings', {
    method: 'PUT',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({
      baseRevision: payload.revision,
      payload: payload.payload,
    }),
  })

  const responsePayload = (await response.json().catch(() => null)) as {
    settings?: SyncDocument
    current?: SyncDocument
    error?: string
  } | null

  if (response.status === 409 && responsePayload?.current) {
    const conflict = new Error(responsePayload.error || 'Settings conflict') as Error & { current?: SyncDocument }
    conflict.current = responsePayload.current
    throw conflict
  }

  if (!response.ok || !responsePayload?.settings) {
    throw new Error(responsePayload?.error || 'Unable to sync settings')
  }

  return responsePayload.settings
}

async function flushSettingsSync() {
  const context = settingsSyncContext
  clearPendingTimer()
  if (!context.enabled || !context.namespace || context.inFlight) {
    return
  }

  // Only local edits override the latest server document. Unchanged storage may
  // contain stale values from an earlier hydration on this device.
  const sentKeys = { ...context.dirtyKeys }
  const nextPayload = { ...context.payload }
  for (const key of Object.keys(sentKeys)) {
    const value = readStorageValue(key, context.namespace)
    if (value === undefined) {
      delete nextPayload[key]
    } else {
      nextPayload[key] = value
    }
  }
  context.inFlight = true

  try {
    const settings = await putSettings({ revision: context.revision, payload: nextPayload })
    if (context !== settingsSyncContext) return

    context.revision = settings.revision
    context.payload = settings.payload
    context.retrying = false
    for (const key of Object.keys(sentKeys)) {
      if (context.dirtyKeys[key] === sentKeys[key]) delete context.dirtyKeys[key]
    }
    if (Object.keys(context.dirtyKeys).length > 0) {
      context.pendingTimer = window.setTimeout(() => void flushSettingsSync(), 250)
    }
  } catch (error) {
    if (context !== settingsSyncContext) return

    const conflictCurrent = (error as Error & { current?: SyncDocument }).current
    if (conflictCurrent) {
      context.revision = conflictCurrent.revision
      context.payload = conflictCurrent.payload
      if (!context.retrying) {
        context.retrying = true
        context.pendingTimer = window.setTimeout(() => void flushSettingsSync(), 200)
        return
      }
    }

    // At most one automatic conflict retry. Keep unsent edits for the next
    // explicit local change, but do not let queued timers create a retry loop.
    clearPendingTimer()
    context.retrying = false
    console.error(error)
  } finally {
    context.inFlight = false
  }
}

export function configureSettingsSync({
  enabled,
  namespace,
  settings,
}: {
  enabled: boolean
  namespace: string | null
  settings?: SyncDocument | null
}) {
  clearPendingTimer()
  // Replacing the context invalidates responses from the previous profile,
  // including disable/re-enable or reconfiguration of the same namespace.
  settingsSyncContext = {
    enabled,
    namespace,
    revision: settings?.revision ?? 0,
    payload: settings?.payload ?? {},
    isHydrating: false,
    pendingTimer: null,
    retrying: false,
    dirtyKeys: {},
    changeSequence: 0,
    inFlight: false,
  }
}

export function hydrateSyncedSettings(namespace: string, payload: Record<string, unknown>) {
  if (!isBrowser()) {
    return
  }

  settingsSyncContext.isHydrating = true

  for (const key of SYNCED_SETTING_KEYS) {
    const scopedKey = getProfileScopedStorageKey(key, namespace)
    if (key in payload) {
      window.localStorage.setItem(scopedKey, JSON.stringify(payload[key]))
    } else {
      window.localStorage.removeItem(scopedKey)
    }
  }

  settingsSyncContext.payload = payload
  settingsSyncContext.isHydrating = false
}

export function queueSettingsSyncForKey(key: string) {
  if (!settingsSyncContext.enabled || settingsSyncContext.isHydrating || !settingsSyncContext.namespace) {
    return
  }

  if (!SYNCED_SETTING_KEYS.includes(key as (typeof SYNCED_SETTING_KEYS)[number])) {
    return
  }

  settingsSyncContext.dirtyKeys[key] = ++settingsSyncContext.changeSequence
  if (settingsSyncContext.inFlight) return

  clearPendingTimer()
  settingsSyncContext.pendingTimer = window.setTimeout(() => {
    void flushSettingsSync()
  }, 250)
}
