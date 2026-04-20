import { createProfileScopedStorage, getProfileScopedStorageKey } from '@/family/storage'
import { queueSettingsSyncForKey } from '@/family/settingsSync'
import { atomWithStorage } from 'jotai/utils'

function isBrowser() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export const PROFILE_SCOPED_STORAGE_KEYS = [
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
  'dismissStartCardDate',
  'hasSeenEnhancedPromotion',
  'donateDate',
]

export function atomWithProfileStorage<Value>(key: string, initialValue: Value) {
  return atomWithStorage(key, initialValue, createProfileScopedStorage<Value>())
}

export function getProfileScopedStorageItem(key: string) {
  if (!isBrowser()) {
    return null
  }

  return window.localStorage.getItem(getProfileScopedStorageKey(key))
}

export function setProfileScopedStorageItem(key: string, value: string) {
  if (!isBrowser()) {
    return
  }

  window.localStorage.setItem(getProfileScopedStorageKey(key), value)
  queueSettingsSyncForKey(key)
}

export function migrateLegacyStorageToProfile(namespace?: string | null) {
  if (!isBrowser() || !namespace) {
    return
  }

  for (const key of PROFILE_SCOPED_STORAGE_KEYS) {
    const scopedKey = getProfileScopedStorageKey(key, namespace)
    const legacyValue = window.localStorage.getItem(key)

    if (legacyValue !== null && window.localStorage.getItem(scopedKey) === null) {
      window.localStorage.setItem(scopedKey, legacyValue)
    }

    if (legacyValue !== null) {
      window.localStorage.removeItem(key)
    }
  }
}
