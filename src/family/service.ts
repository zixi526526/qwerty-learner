import { normalizeProfileUsername } from './storage'

export type FamilyProfile = {
  id: string
  username: string
  displayName: string
  welcomeMessage: string
  createdAt: string
  updatedAt: string
  lastSeenAt: string | null
}

export type FamilyRuntimeMode = 'server' | 'local'

export type FamilySyncDocument = {
  revision: number
  payload: Record<string, unknown>
  schemaVersion: number
  updatedAt: string | null
}

export type FamilyBootstrap = {
  profile: FamilyProfile
  settings: FamilySyncDocument
  progress: FamilySyncDocument
}

export type FamilySnapshot = {
  activeProfile: FamilyProfile | null
  profiles: FamilyProfile[]
  runtimeMode: FamilyRuntimeMode
  lastSyncedAt: string | null
}

export type CreateFamilyProfileInput = {
  username: string
  displayName?: string
  welcomeMessage?: string
}

export type UpdateFamilyProfileInput = {
  username?: string
  displayName?: string
  welcomeMessage?: string
}

const LOCAL_PROFILES_KEY = 'family.local.profiles'
const LOCAL_ACTIVE_PROFILE_KEY = 'family.local.activeProfileId'

function isBrowser() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function getTimestamp() {
  return new Date().toISOString()
}

function safeParse<T>(value: string | null, fallback: T): T {
  if (!value) {
    return fallback
  }

  try {
    return JSON.parse(value) as T
  } catch (error) {
    console.warn('Failed to parse family service payload', error)
    return fallback
  }
}

function readLocalProfiles() {
  if (!isBrowser()) {
    return [] as FamilyProfile[]
  }

  return safeParse<FamilyProfile[]>(window.localStorage.getItem(LOCAL_PROFILES_KEY), []).sort((a, b) => {
    return b.updatedAt.localeCompare(a.updatedAt)
  })
}

function writeLocalProfiles(profiles: FamilyProfile[]) {
  if (!isBrowser()) {
    return
  }

  window.localStorage.setItem(LOCAL_PROFILES_KEY, JSON.stringify(profiles))
}

function readLocalActiveProfileId() {
  if (!isBrowser()) {
    return null
  }

  return window.localStorage.getItem(LOCAL_ACTIVE_PROFILE_KEY)
}

function writeLocalActiveProfileId(profileId: string | null) {
  if (!isBrowser()) {
    return
  }

  if (profileId) {
    window.localStorage.setItem(LOCAL_ACTIVE_PROFILE_KEY, profileId)
    return
  }

  window.localStorage.removeItem(LOCAL_ACTIVE_PROFILE_KEY)
}

function createWelcomeMessage(displayName: string) {
  return `Welcome back, ${displayName}!`
}

function getLatestTimestamp(...values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value)).sort().pop() || null
}

function createProfileId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `family-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function normalizeProfile(rawProfile: Partial<FamilyProfile> & Record<string, unknown>): FamilyProfile | null {
  if (!rawProfile) {
    return null
  }

  const usernameValue = typeof rawProfile.username === 'string' ? rawProfile.username : typeof rawProfile.name === 'string' ? rawProfile.name : ''
  const normalizedUsername = normalizeProfileUsername(usernameValue)

  if (!normalizedUsername) {
    return null
  }

  const displayName =
    typeof rawProfile.displayName === 'string'
      ? rawProfile.displayName
      : typeof rawProfile.display_name === 'string'
        ? rawProfile.display_name
        : usernameValue

  const welcomeMessage =
    typeof rawProfile.welcomeMessage === 'string'
      ? rawProfile.welcomeMessage
      : typeof rawProfile.welcome_message === 'string'
        ? rawProfile.welcome_message
        : createWelcomeMessage(displayName || normalizedUsername)

  return {
    id: typeof rawProfile.id === 'string' ? rawProfile.id : normalizedUsername,
    username: normalizedUsername,
    displayName: displayName || normalizedUsername,
    welcomeMessage,
    createdAt: typeof rawProfile.createdAt === 'string' ? rawProfile.createdAt : getTimestamp(),
    updatedAt: typeof rawProfile.updatedAt === 'string' ? rawProfile.updatedAt : getTimestamp(),
    lastSeenAt:
      typeof rawProfile.lastSeenAt === 'string'
        ? rawProfile.lastSeenAt
        : typeof rawProfile.last_seen_at === 'string'
          ? rawProfile.last_seen_at
          : null,
  }
}

function isFamilyProfile(profile: FamilyProfile | null): profile is FamilyProfile {
  return profile !== null
}

function normalizeSyncDocument(rawDocument: Record<string, unknown> | null | undefined): FamilySyncDocument {
  return {
    revision: typeof rawDocument?.revision === 'number' ? rawDocument.revision : 0,
    payload: typeof rawDocument?.payload === 'object' && rawDocument.payload ? (rawDocument.payload as Record<string, unknown>) : {},
    schemaVersion: typeof rawDocument?.schemaVersion === 'number' ? rawDocument.schemaVersion : 1,
    updatedAt:
      typeof rawDocument?.updatedAt === 'string'
        ? rawDocument.updatedAt
        : typeof rawDocument?.updated_at === 'string'
          ? rawDocument.updated_at
          : null,
  }
}

function normalizeBootstrap(rawBootstrap: Record<string, unknown> | null | undefined): FamilyBootstrap | null {
  if (!rawBootstrap) {
    return null
  }

  const profile = normalizeProfile(
    ((typeof rawBootstrap.profile === 'object' && rawBootstrap.profile) || rawBootstrap) as Record<string, unknown>,
  )

  if (!profile) {
    return null
  }

  return {
    profile,
    settings: normalizeSyncDocument(rawBootstrap.settings as Record<string, unknown> | undefined),
    progress: normalizeSyncDocument(rawBootstrap.progress as Record<string, unknown> | undefined),
  }
}

async function fetchJson(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    credentials: 'include',
    ...init,
  })

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    throw new Error(`Expected JSON from ${path}, received ${contentType || 'unknown content type'}`)
  }

  const payload = (await response.json()) as Record<string, unknown>

  if (!response.ok) {
    const message = typeof payload.message === 'string' ? payload.message : `Request failed for ${path}`
    throw new Error(message)
  }

  return payload
}

async function tryLoadServerSnapshot(): Promise<FamilySnapshot | null> {
  try {
    const profilesPayload = await fetchJson('/api/profiles', { method: 'GET' })
    const profiles = Array.isArray(profilesPayload.profiles)
      ? profilesPayload.profiles.map((profile) => normalizeProfile(profile as Record<string, unknown>)).filter(isFamilyProfile)
      : Array.isArray(profilesPayload.data)
        ? profilesPayload.data.map((profile) => normalizeProfile(profile as Record<string, unknown>)).filter(isFamilyProfile)
        : []

    const meResponse = await fetch('/api/me', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      credentials: 'include',
    })

    let activeProfile: FamilyProfile | null = null
    let lastSyncedAt: string | null = null

    if (meResponse.ok) {
      const mePayload = (await meResponse.json()) as Record<string, unknown>
      const meCandidate =
        (typeof mePayload.profile === 'object' && mePayload.profile ? mePayload.profile : null) ||
        (typeof mePayload.user === 'object' && mePayload.user ? mePayload.user : null) ||
        mePayload
      activeProfile = normalizeProfile(meCandidate as Record<string, unknown>)

      if (activeProfile) {
        try {
          const bootstrapPayload = await fetchJson('/api/sync/bootstrap', { method: 'GET' })
          const bootstrap = normalizeBootstrap(bootstrapPayload)
          lastSyncedAt = bootstrap
            ? getLatestTimestamp(bootstrap.profile.lastSeenAt, bootstrap.settings.updatedAt, bootstrap.progress.updatedAt)
            : getLatestTimestamp(activeProfile.lastSeenAt, activeProfile.updatedAt)
        } catch (error) {
          console.warn('Bootstrap endpoint unavailable, continuing with profile shell only', error)
          lastSyncedAt = getLatestTimestamp(activeProfile.lastSeenAt, activeProfile.updatedAt) || getTimestamp()
        }
      }
    }

    return {
      profiles,
      activeProfile,
      runtimeMode: 'server',
      lastSyncedAt,
    }
  } catch (error) {
    console.warn('Server family APIs unavailable, falling back to local family shell', error)
    return null
  }
}

function loadLocalSnapshot(): FamilySnapshot {
  const profiles = readLocalProfiles()
  const activeProfileId = readLocalActiveProfileId()
  const activeProfile = profiles.find((profile) => profile.id === activeProfileId) || null

  return {
    profiles,
    activeProfile,
    runtimeMode: 'local',
    lastSyncedAt: activeProfile?.lastSeenAt || null,
  }
}

export async function loadFamilySnapshot(): Promise<FamilySnapshot> {
  return (await tryLoadServerSnapshot()) || loadLocalSnapshot()
}

export async function createFamilyProfile(runtimeMode: FamilyRuntimeMode, input: CreateFamilyProfileInput) {
  const normalizedUsername = normalizeProfileUsername(input.username)

  if (!normalizedUsername) {
    throw new Error('Username is required')
  }

  const displayName = input.displayName?.trim() || input.username.trim()
  const welcomeMessage = input.welcomeMessage?.trim() || createWelcomeMessage(displayName)

  if (runtimeMode === 'server') {
    const createdPayload = await fetchJson('/api/profiles', {
      method: 'POST',
      body: JSON.stringify({
        username: normalizedUsername,
        displayName,
        welcomeMessage,
      }),
    })

    return normalizeProfile(
      ((typeof createdPayload.profile === 'object' && createdPayload.profile) || createdPayload) as Record<string, unknown>,
    )
  }

  const profiles = readLocalProfiles()
  if (profiles.some((profile) => profile.username === normalizedUsername)) {
    throw new Error('That username already exists')
  }

  const now = getTimestamp()
  const profile: FamilyProfile = {
    id: createProfileId(),
    username: normalizedUsername,
    displayName,
    welcomeMessage,
    createdAt: now,
    updatedAt: now,
    lastSeenAt: null,
  }

  writeLocalProfiles([profile, ...profiles])
  return profile
}

export async function selectFamilyProfile(runtimeMode: FamilyRuntimeMode, profile: FamilyProfile) {
  const timestamp = getTimestamp()

  if (runtimeMode === 'server') {
    const selectedPayload = await fetchJson('/api/session/select', {
      method: 'POST',
      body: JSON.stringify({
        username: profile.username,
      }),
    })

    const bootstrapPayload = await fetchJson('/api/sync/bootstrap', {
      method: 'GET',
    })
    const bootstrap = normalizeBootstrap(bootstrapPayload)
    const activeProfile =
      bootstrap?.profile ||
      normalizeProfile(
        ((typeof selectedPayload.profile === 'object' && selectedPayload.profile) || selectedPayload) as Record<string, unknown>,
      ) || { ...profile, lastSeenAt: timestamp, updatedAt: timestamp }

    return {
      activeProfile,
      lastSyncedAt: bootstrap
        ? getLatestTimestamp(activeProfile.lastSeenAt, bootstrap.settings.updatedAt, bootstrap.progress.updatedAt)
        : getLatestTimestamp(activeProfile.lastSeenAt, activeProfile.updatedAt) || timestamp,
    }
  }

  const profiles = readLocalProfiles().map((candidate) => {
    if (candidate.id !== profile.id) {
      return candidate
    }

    return {
      ...candidate,
      lastSeenAt: timestamp,
      updatedAt: timestamp,
    }
  })
  writeLocalProfiles(profiles)
  writeLocalActiveProfileId(profile.id)

  return {
    activeProfile: profiles.find((candidate) => candidate.id === profile.id) || null,
    lastSyncedAt: timestamp,
  }
}

export async function updateFamilyProfile(runtimeMode: FamilyRuntimeMode, profileId: string, input: UpdateFamilyProfileInput) {
  if (runtimeMode === 'server') {
    const updatedPayload = await fetchJson(`/api/profiles/${profileId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        username: input.username,
        displayName: input.displayName,
        welcomeMessage: input.welcomeMessage,
      }),
    })

    return normalizeProfile(
      ((typeof updatedPayload.profile === 'object' && updatedPayload.profile) || updatedPayload) as Record<string, unknown>,
    )
  }

  const timestamp = getTimestamp()
  let updatedProfile: FamilyProfile | null = null
  const profiles = readLocalProfiles().map((profile) => {
    if (profile.id !== profileId) {
      return profile
    }

    updatedProfile = {
      ...profile,
      displayName: input.displayName?.trim() || profile.displayName,
      welcomeMessage: input.welcomeMessage?.trim() || profile.welcomeMessage,
      updatedAt: timestamp,
    }

    return updatedProfile
  })

  writeLocalProfiles(profiles)
  return updatedProfile
}

export async function exportFamilyProfile(runtimeMode: FamilyRuntimeMode, profile: FamilyProfile) {
  if (runtimeMode === 'server') {
    const response = await fetch(`/api/profiles/${profile.id}/export`, {
      method: 'GET',
      credentials: 'include',
    })

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null
      throw new Error(typeof payload?.error === 'string' ? payload.error : 'Unable to export profile backup')
    }

    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${profile.username}-backup.json`
    anchor.click()
    window.URL.revokeObjectURL(url)
    return
  }

  const profiles = readLocalProfiles()
  const targetProfile = profiles.find((candidate) => candidate.id === profile.id)
  if (!targetProfile) {
    throw new Error('Profile not found')
  }

  const blob = new Blob([JSON.stringify({ profile: targetProfile, exportedAt: getTimestamp() }, null, 2)], { type: 'application/json' })
  const url = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${targetProfile.username}-backup.local.json`
  anchor.click()
  window.URL.revokeObjectURL(url)
}

export async function deleteFamilyProfile(runtimeMode: FamilyRuntimeMode, profileId: string, confirmationText?: string) {
  if (runtimeMode === 'server') {
    await fetchJson(`/api/profiles/${profileId}`, {
      method: 'DELETE',
      body: JSON.stringify({
        confirmationText,
      }),
    })
    return
  }

  const nextProfiles = readLocalProfiles().filter((profile) => profile.id !== profileId)
  const activeProfileId = readLocalActiveProfileId()
  writeLocalProfiles(nextProfiles)

  if (activeProfileId === profileId) {
    writeLocalActiveProfileId(null)
  }
}

export async function logoutFamilyProfile(runtimeMode: FamilyRuntimeMode) {
  if (runtimeMode === 'server') {
    await fetchJson('/api/session/logout', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    return
  }

  writeLocalActiveProfileId(null)
}
