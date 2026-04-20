import type { WritableAtom } from 'jotai'
import { atom } from 'jotai'
import type { RESET } from 'jotai/vanilla/utils/constants'
import { createProfileScopedStorage } from '@/family/storage'
import { atomWithProfileStorage } from './profileStorage'

type SetStateActionWithReset<Value> = Value | typeof RESET | ((prev: Value) => Value | typeof RESET)

export default function atomForConfig<T extends Record<string, unknown>>(
  key: string,
  defaultValue: T,
): WritableAtom<T, [SetStateActionWithReset<T>], void> {
  const storage = createProfileScopedStorage<T>()
  const storageAtom = atomWithProfileStorage(key, defaultValue)
  return atom((get) => {
    // Get the underlying object
    const config = get(storageAtom)

    let newConfig: T

    // Check if the types are different
    const isTypeMismatch = typeof config !== typeof defaultValue

    if (isTypeMismatch) {
      newConfig = defaultValue
    } else {
      // Check if there are missing properties
      let hasMissingProperty = false
      for (const key in defaultValue) {
        if (!(key in config)) {
          hasMissingProperty = true
          break
        }
      }

      newConfig = hasMissingProperty ? { ...defaultValue, ...config } : config
    }

    if (newConfig !== config) {
      storage.setItem(key, newConfig)
    }

    return newConfig
  }, storageAtom.write)
}
