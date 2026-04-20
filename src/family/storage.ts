type StorageValue = unknown

const PROFILE_SCOPE_PREFIX = 'family.profile'

let activeProfileNamespace = 'guest'

function isBrowser() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function safeParse<T>(value: string | null, fallback: T): T {
  if (!value) {
    return fallback
  }

  try {
    return JSON.parse(value) as T
  } catch (error) {
    console.warn('Failed to parse profile-scoped storage value', error)
    return fallback
  }
}

export function normalizeProfileUsername(username: string) {
  return username.trim().toLowerCase().replace(/\s+/g, '-')
}

export function getActiveProfileNamespace() {
  return activeProfileNamespace
}

export function getProfileScopedStorageKey(key: string, namespace = activeProfileNamespace) {
  return `${PROFILE_SCOPE_PREFIX}:${namespace}:${key}`
}

export function getProfileScopedDbName(namespace = activeProfileNamespace) {
  return `RecordDB:${namespace}`
}

export function setActiveProfileNamespace(namespace?: string | null) {
  activeProfileNamespace = namespace || 'guest'
}

export function createProfileScopedStorage<Value extends StorageValue>() {
  return {
    getItem: (key: string, initialValue: Value) => {
      if (!isBrowser()) {
        return initialValue
      }

      return safeParse(window.localStorage.getItem(getProfileScopedStorageKey(key)), initialValue)
    },
    setItem: (key: string, newValue: Value) => {
      if (!isBrowser()) {
        return
      }

      window.localStorage.setItem(getProfileScopedStorageKey(key), JSON.stringify(newValue))
      import('./settingsSync')
        .then(({ queueSettingsSyncForKey }) => queueSettingsSyncForKey(key))
        .catch((error) => console.error('Failed to queue settings sync', error))
    },
    removeItem: (key: string) => {
      if (!isBrowser()) {
        return
      }

      window.localStorage.removeItem(getProfileScopedStorageKey(key))
    },
  }
}
