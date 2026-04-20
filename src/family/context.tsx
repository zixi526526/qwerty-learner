import {
  createFamilyProfile,
  deleteFamilyProfile,
  loadFamilySnapshot,
  logoutFamilyProfile,
  selectFamilyProfile,
  updateFamilyProfile,
} from './service'
import type { CreateFamilyProfileInput, FamilyProfile, FamilyRuntimeMode, UpdateFamilyProfileInput } from './service'
import { normalizeProfileUsername } from './storage'
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
  createProfile: (input: CreateFamilyProfileInput) => Promise<void>
  deleteProfile: (profileId: string) => Promise<void>
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

  const refresh = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const snapshot = await loadFamilySnapshot()
      setProfiles(snapshot.profiles)
      setActiveProfile(snapshot.activeProfile)
      setRuntimeMode(snapshot.runtimeMode)
      setLastSyncedAt(snapshot.lastSyncedAt)
      setStoreEpoch((previous) => previous + 1)
    } catch (refreshError) {
      console.error(refreshError)
      setError(refreshError instanceof Error ? refreshError.message : 'Unable to load family profiles')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const selectProfile = useCallback(
    async (profile: FamilyProfile) => {
      setError(null)
      const selection = await selectFamilyProfile(runtimeMode, profile)
      setActiveProfile(selection.activeProfile)
      setLastSyncedAt(selection.lastSyncedAt)
      setStoreEpoch((previous) => previous + 1)
      setProfiles((currentProfiles) =>
        currentProfiles.map((candidate) => (selection.activeProfile && candidate.id === selection.activeProfile.id ? selection.activeProfile : candidate)),
      )
    },
    [runtimeMode],
  )

  const createProfile = useCallback(
    async (input: CreateFamilyProfileInput) => {
      setError(null)
      const createdProfile = await createFamilyProfile(runtimeMode, input)
      if (!createdProfile) {
        throw new Error('Unable to create profile')
      }

      setProfiles((currentProfiles) => [createdProfile, ...currentProfiles.filter((candidate) => candidate.id !== createdProfile.id)])
      await selectProfile(createdProfile)
    },
    [runtimeMode, selectProfile],
  )

  const updateProfileEntry = useCallback(
    async (profileId: string, input: UpdateFamilyProfileInput) => {
      setError(null)
      const updatedProfile = await updateFamilyProfile(runtimeMode, profileId, input)
      if (!updatedProfile) {
        throw new Error('Unable to update profile')
      }

      setProfiles((currentProfiles) => currentProfiles.map((candidate) => (candidate.id === profileId ? updatedProfile : candidate)))
      setActiveProfile((currentProfile) => (currentProfile?.id === profileId ? updatedProfile : currentProfile))
    },
    [runtimeMode],
  )

  const deleteProfileEntry = useCallback(
    async (profileId: string) => {
      setError(null)
      const isDeletingActiveProfile = activeProfile?.id === profileId

      await deleteFamilyProfile(runtimeMode, profileId)
      setProfiles((currentProfiles) => currentProfiles.filter((candidate) => candidate.id !== profileId))

      if (isDeletingActiveProfile) {
        setActiveProfile(null)
        setLastSyncedAt(null)
        setStoreEpoch((previous) => previous + 1)
      }
    },
    [activeProfile?.id, runtimeMode],
  )

  const logout = useCallback(async () => {
    setError(null)
    await logoutFamilyProfile(runtimeMode)
    setActiveProfile(null)
    setLastSyncedAt(null)
    setStoreEpoch((previous) => previous + 1)
  }, [runtimeMode])

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
      createProfile,
      deleteProfile: deleteProfileEntry,
      logout,
      refresh,
      selectProfile,
      updateProfile: updateProfileEntry,
    }
  }, [activeProfile, createProfile, deleteProfileEntry, error, isLoading, lastSyncedAt, logout, profiles, refresh, runtimeMode, selectProfile, storeEpoch, updateProfileEntry])

  return <FamilyContext.Provider value={value}>{children}</FamilyContext.Provider>
}

export function useFamily() {
  const context = useContext(FamilyContext)
  if (!context) {
    throw new Error('useFamily must be used inside FamilyProvider')
  }

  return context
}
