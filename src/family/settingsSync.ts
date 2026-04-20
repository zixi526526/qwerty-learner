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
}

const DEVICE_LOCAL_SETTING_KEYS = new Set(['dismissStartCardDate'])

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

const settingsSyncContext: SettingsSyncContext = {
  enabled: false,
  namespace: null,
  revision: 0,
  payload: {},
  isHydrating: false,
  pendingTimer: null,
  retrying: false,
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

function buildPayloadFromStorage(namespace: string) {
  return SYNCED_SETTING_KEYS.reduce<Record<string, unknown>>((payload, key) => {
    if (DEVICE_LOCAL_SETTING_KEYS.has(key)) {
      return payload
    }

    const value = readStorageValue(key, namespace)
    if (value !== undefined) {
      payload[key] = value
    }
    return payload
  }, {})
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

  const responsePayload = (await response.json().catch(() => null)) as
    | { settings?: SyncDocument; current?: SyncDocument; error?: string }
    | null

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
  if (!settingsSyncContext.enabled || !settingsSyncContext.namespace) {
    clearPendingTimer()
    return
  }

  clearPendingTimer()
  const namespace = settingsSyncContext.namespace
  const nextPayload = buildPayloadFromStorage(namespace)

  try {
    const settings = await putSettings({
      revision: settingsSyncContext.revision,
      payload: nextPayload,
    })
    settingsSyncContext.revision = settings.revision
    settingsSyncContext.payload = settings.payload
    settingsSyncContext.retrying = false
  } catch (error) {
    const conflictCurrent = (error as Error & { current?: SyncDocument }).current
    if (conflictCurrent && !settingsSyncContext.retrying) {
      settingsSyncContext.retrying = true
      settingsSyncContext.revision = conflictCurrent.revision
      settingsSyncContext.payload = {
        ...conflictCurrent.payload,
        ...nextPayload,
      }
      settingsSyncContext.pendingTimer = window.setTimeout(() => {
        void flushSettingsSync()
      }, 200)
      return
    }

    settingsSyncContext.retrying = false
    console.error(error)
  }
}

export function configureSettingsSync({ enabled, namespace, settings }: { enabled: boolean; namespace: string | null; settings?: SyncDocument | null }) {
  settingsSyncContext.enabled = enabled
  settingsSyncContext.namespace = namespace
  settingsSyncContext.revision = settings?.revision ?? 0
  settingsSyncContext.payload = settings?.payload ?? {}
  settingsSyncContext.retrying = false

  if (!enabled) {
    clearPendingTimer()
  }
}

export function hydrateSyncedSettings(namespace: string, payload: Record<string, unknown>) {
  if (!isBrowser()) {
    return
  }

  settingsSyncContext.isHydrating = true

  for (const key of SYNCED_SETTING_KEYS) {
    if (DEVICE_LOCAL_SETTING_KEYS.has(key)) {
      continue
    }

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

  if (DEVICE_LOCAL_SETTING_KEYS.has(key)) {
    return
  }

  clearPendingTimer()
  settingsSyncContext.pendingTimer = window.setTimeout(() => {
    void flushSettingsSync()
  }, 250)
}
