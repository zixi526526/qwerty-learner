import {
  createFamilyProfile,
  deleteFamilyProfile,
  exportFamilyProfile,
  loadFamilySnapshot,
  logoutFamilyProfile,
  selectFamilyProfile,
  updateFamilyProfile,
} from './service'
import type { CreateFamilyProfileInput, FamilyBootstrap, FamilyProfile, FamilyRuntimeMode, UpdateFamilyProfileInput } from './service'
import { configurePracticeSync } from './practiceSync'
import { configureSettingsSync, hydrateSyncedSettings } from './settingsSync'
import { normalizeProfileUsername, setActiveProfileNamespace } from './storage'
import { migrateLegacyStorageToProfile } from '@/store/profileStorage'
import { clearLegacyGuestDb, replacePracticeSnapshot, setActiveDbNamespace } from '@/utils/db'
import type { PropsWithChildren } from 'react'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

type FamilyContextValue = {
  activeProfile: FamilyProfile | null
  error: string | null
  isLoading: boolean
  lastSyncedAt: string | null
  profileStoreKey: string
  profiles: FamilyProfile[]
  runtimeMode: FamilyRuntimeMode
  isServerUnavailable: boolean
  createProfile: (input: CreateFamilyProfileInput) => Promise<void>
  deleteProfile: (profileId: string, confirmationText?: string) => Promise<void>
  exportProfile: (profile: FamilyProfile) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
  selectProfile: (profile: FamilyProfile) => Promise<void>
  updateProfile: (profileId: string, input: UpdateFamilyProfileInput) => Promise<void>
}

const FamilyContext = createContext<FamilyContextValue | null>(null)

export function FamilyProvider({ children }: PropsWithChildren) {
  const [profiles, setProfiles] = useState<FamilyProfile[]>([])
  const [activeProfile, setActiveProfile] = useState<FamilyProfile | null>(null)
  const [runtimeMode, setRuntimeMode] = useState<FamilyRuntimeMode>('local')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [storeEpoch, setStoreEpoch] = useState(0)
  const [isServerUnavailable, setIsServerUnavailable] = useState(false)

  const applyProfileStorageNamespace = useCallback((profile: FamilyProfile | null) => {
    const namespace = profile ? normalizeProfileUsername(profile.username) : null
    setActiveProfileNamespace(namespace)
    setActiveDbNamespace(namespace)

    if (namespace) {
      migrateLegacyStorageToProfile(namespace)
    }
  }, [])

  const applyServerBootstrap = useCallback(
    async (profile: FamilyProfile | null, bootstrap: FamilyBootstrap | null) => {
      if (!profile || !bootstrap) {
        configureSettingsSync({ enabled: false, namespace: null, settings: null })
        configurePracticeSync(false)
        return
      }

      const namespace = normalizeProfileUsername(profile.username)
      hydrateSyncedSettings(namespace, bootstrap.settings.payload)
      await replacePracticeSnapshot(bootstrap.practice)
      await clearLegacyGuestDb()
      configureSettingsSync({ enabled: true, namespace, settings: bootstrap.settings })
      configurePracticeSync(true)
    },
    [],
  )

  const refresh = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const snapshot = await loadFamilySnapshot()
      applyProfileStorageNamespace(snapshot.activeProfile)
      await applyServerBootstrap(snapshot.activeProfile, snapshot.bootstrap)
      setProfiles(snapshot.profiles)
      setActiveProfile(snapshot.activeProfile)
      setRuntimeMode(snapshot.runtimeMode)
      setLastSyncedAt(snapshot.lastSyncedAt)
      setIsServerUnavailable(false)
      setStoreEpoch((previous) => previous + 1)
    } catch (refreshError) {
      console.error(refreshError)
      applyProfileStorageNamespace(null)
      await applyServerBootstrap(null, null)
      setProfiles([])
      setActiveProfile(null)
      setLastSyncedAt(null)
      setIsServerUnavailable(true)
      setError(refreshError instanceof Error ? refreshError.message : 'Unable to load family profiles')
    } finally {
      setIsLoading(false)
    }
  }, [applyProfileStorageNamespace, applyServerBootstrap])

  useEffect(() => {
    refresh()
  }, [refresh])

  const selectProfile = useCallback(
    async (profile: FamilyProfile) => {
      if (isServerUnavailable) {
        throw new Error('Family server is unavailable')
      }
      setError(null)
      const selection = await selectFamilyProfile(runtimeMode, profile)
      applyProfileStorageNamespace(selection.activeProfile)
      await applyServerBootstrap(selection.activeProfile, selection.bootstrap)
      setActiveProfile(selection.activeProfile)
      setLastSyncedAt(selection.lastSyncedAt)
      setStoreEpoch((previous) => previous + 1)
      setProfiles((currentProfiles) =>
        currentProfiles.map((candidate) => (selection.activeProfile && candidate.id === selection.activeProfile.id ? selection.activeProfile : candidate)),
      )
    },
    [applyProfileStorageNamespace, applyServerBootstrap, isServerUnavailable, runtimeMode],
  )

  const createProfile = useCallback(
    async (input: CreateFamilyProfileInput) => {
      if (isServerUnavailable) {
        throw new Error('Family server is unavailable')
      }
      setError(null)
      const createdProfile = await createFamilyProfile(runtimeMode, input)
      if (!createdProfile) {
        throw new Error('Unable to create profile')
      }

      setProfiles((currentProfiles) => [createdProfile, ...currentProfiles.filter((candidate) => candidate.id !== createdProfile.id)])
      await selectProfile(createdProfile)
    },
    [isServerUnavailable, runtimeMode, selectProfile],
  )

  const updateProfileEntry = useCallback(
    async (profileId: string, input: UpdateFamilyProfileInput) => {
      if (isServerUnavailable) {
        throw new Error('Family server is unavailable')
      }
      setError(null)
      const updatedProfile = await updateFamilyProfile(runtimeMode, profileId, input)
      if (!updatedProfile) {
        throw new Error('Unable to update profile')
      }

      setProfiles((currentProfiles) => currentProfiles.map((candidate) => (candidate.id === profileId ? updatedProfile : candidate)))
      setActiveProfile((currentProfile) => (currentProfile?.id === profileId ? updatedProfile : currentProfile))
    },
    [isServerUnavailable, runtimeMode],
  )

  const deleteProfileEntry = useCallback(
    async (profileId: string, confirmationText?: string) => {
      if (isServerUnavailable) {
        throw new Error('Family server is unavailable')
      }
      setError(null)
      const isDeletingActiveProfile = activeProfile?.id === profileId

      await deleteFamilyProfile(runtimeMode, profileId, confirmationText)
      setProfiles((currentProfiles) => currentProfiles.filter((candidate) => candidate.id !== profileId))

      if (isDeletingActiveProfile) {
        applyProfileStorageNamespace(null)
        await applyServerBootstrap(null, null)
        setActiveProfile(null)
        setLastSyncedAt(null)
        setStoreEpoch((previous) => previous + 1)
      }
    },
    [activeProfile?.id, applyProfileStorageNamespace, applyServerBootstrap, isServerUnavailable, runtimeMode],
  )

  const exportProfileEntry = useCallback(
    async (profile: FamilyProfile) => {
      if (isServerUnavailable) {
        throw new Error('Family server is unavailable')
      }
      setError(null)
      await exportFamilyProfile(runtimeMode, profile)
    },
    [isServerUnavailable, runtimeMode],
  )

  const logout = useCallback(async () => {
    if (isServerUnavailable) {
      throw new Error('Family server is unavailable')
    }
    setError(null)
    await logoutFamilyProfile(runtimeMode)
    applyProfileStorageNamespace(null)
    await applyServerBootstrap(null, null)
    setActiveProfile(null)
    setLastSyncedAt(null)
    setStoreEpoch((previous) => previous + 1)
  }, [applyProfileStorageNamespace, applyServerBootstrap, isServerUnavailable, runtimeMode])

  const value = useMemo<FamilyContextValue>(() => {
    const profileStoreKey = `${activeProfile ? normalizeProfileUsername(activeProfile.username) : 'guest'}:${storeEpoch}`

    return {
      activeProfile,
      error,
      isLoading,
      lastSyncedAt,
      profileStoreKey,
      profiles,
      runtimeMode,
      isServerUnavailable,
      createProfile,
      deleteProfile: deleteProfileEntry,
      exportProfile: exportProfileEntry,
      logout,
      refresh,
      selectProfile,
      updateProfile: updateProfileEntry,
    }
  }, [activeProfile, createProfile, deleteProfileEntry, error, exportProfileEntry, isLoading, isServerUnavailable, lastSyncedAt, logout, profiles, refresh, runtimeMode, selectProfile, storeEpoch, updateProfileEntry])

  return <FamilyContext.Provider value={value}>{children}</FamilyContext.Provider>
}

export function useFamily() {
  const context = useContext(FamilyContext)
  if (!context) {
    throw new Error('useFamily must be used inside FamilyProvider')
  }

  return context
}
