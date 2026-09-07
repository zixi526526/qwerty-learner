import { normalizeProfileUsername } from './storage'
import type { IChapterRecord, IReviewRecord, IWordRecord } from '@/utils/db/record'

export type FamilyProfile = {
  id: string
  username: string
  displayName: string
  welcomeMessage: string
  createdAt: string
  updatedAt: string
  lastSeenAt: string | null
}

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
  practice: FamilyPracticeSnapshot
}

export type FamilyPracticeSnapshot = {
  wordRecords: IWordRecord[]
  chapterRecords: IChapterRecord[]
  reviewRecords: IReviewRecord[]
}

export type FamilySnapshot = {
  activeProfile: FamilyProfile | null
  profiles: FamilyProfile[]
  lastSyncedAt: string | null
  bootstrap: FamilyBootstrap | null
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

function getTimestamp() {
  return new Date().toISOString()
}

function createWelcomeMessage(displayName: string) {
  return `Welcome back, ${displayName}!`
}

function getLatestTimestamp(...values: Array<string | null | undefined>) {
  return (
    values
      .filter((value): value is string => Boolean(value))
      .sort()
      .pop() || null
  )
}

function normalizeProfileId(rawId: unknown, fallbackId: string) {
  if (typeof rawId === 'string' && rawId.trim()) {
    return rawId
  }

  if (typeof rawId === 'number' && Number.isFinite(rawId)) {
    return String(rawId)
  }

  return fallbackId
}

function normalizeProfile(rawProfile: Partial<FamilyProfile> & Record<string, unknown>): FamilyProfile | null {
  if (!rawProfile) {
    return null
  }

  const usernameValue =
    typeof rawProfile.username === 'string' ? rawProfile.username : typeof rawProfile.name === 'string' ? rawProfile.name : ''
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
    id: normalizeProfileId(rawProfile.id, normalizedUsername),
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

function normalizeRecordArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function normalizePracticeSnapshot(rawPractice: Record<string, unknown> | null | undefined): FamilyPracticeSnapshot {
  return {
    wordRecords: normalizeRecordArray<IWordRecord>(rawPractice?.wordRecords),
    chapterRecords: normalizeRecordArray<IChapterRecord>(rawPractice?.chapterRecords),
    reviewRecords: normalizeRecordArray<IReviewRecord>(rawPractice?.reviewRecords),
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
    practice: normalizePracticeSnapshot(rawBootstrap.practice as Record<string, unknown> | undefined),
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
    const message =
      typeof payload.error === 'string'
        ? payload.error
        : typeof payload.message === 'string'
        ? payload.message
        : `Request failed for ${path}`
    throw new Error(message)
  }

  return payload
}

async function loadServerSnapshot(): Promise<FamilySnapshot> {
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
  let bootstrap: FamilyBootstrap | null = null

  if (meResponse.ok) {
    const mePayload = (await meResponse.json()) as Record<string, unknown>
    const meCandidate =
      (typeof mePayload.profile === 'object' && mePayload.profile ? mePayload.profile : null) ||
      (typeof mePayload.user === 'object' && mePayload.user ? mePayload.user : null) ||
      mePayload
    activeProfile = normalizeProfile(meCandidate as Record<string, unknown>)

    if (activeProfile) {
      bootstrap = normalizeBootstrap(await fetchJson('/api/sync/bootstrap', { method: 'GET' }))
    }
  }

  const lastSyncedAt = bootstrap
    ? getLatestTimestamp(bootstrap.profile.lastSeenAt, bootstrap.settings.updatedAt, bootstrap.progress.updatedAt)
    : getLatestTimestamp(activeProfile?.lastSeenAt, activeProfile?.updatedAt)

  return {
    profiles,
    activeProfile,
    lastSyncedAt,
    bootstrap,
  }
}

export async function loadFamilySnapshot(): Promise<FamilySnapshot> {
  return loadServerSnapshot()
}

export async function createFamilyProfile(input: CreateFamilyProfileInput) {
  const normalizedUsername = normalizeProfileUsername(input.username)

  if (!normalizedUsername) {
    throw new Error('Username is required')
  }

  const displayName = input.displayName?.trim() || input.username.trim()
  const welcomeMessage = input.welcomeMessage?.trim() || createWelcomeMessage(displayName)

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

export async function selectFamilyProfile(profile: FamilyProfile) {
  const timestamp = getTimestamp()

  const selectedPayload = await fetchJson('/api/session/select', {
    method: 'POST',
    body: JSON.stringify({
      username: profile.username,
    }),
  })

  const bootstrapPayload = await fetchJson('/api/sync/bootstrap', { method: 'GET' })
  const bootstrap = normalizeBootstrap(bootstrapPayload)
  const activeProfile = bootstrap?.profile ||
    normalizeProfile(
      ((typeof selectedPayload.profile === 'object' && selectedPayload.profile) || selectedPayload) as Record<string, unknown>,
    ) || {
      ...profile,
      lastSeenAt: timestamp,
      updatedAt: timestamp,
    }

  return {
    activeProfile,
    lastSyncedAt: bootstrap
      ? getLatestTimestamp(activeProfile.lastSeenAt, bootstrap.settings.updatedAt, bootstrap.progress.updatedAt)
      : getLatestTimestamp(activeProfile.lastSeenAt, activeProfile.updatedAt) || timestamp,
    bootstrap,
  }
}

export async function updateFamilyProfile(profileId: string, input: UpdateFamilyProfileInput) {
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

export async function exportFamilyProfile(profile: FamilyProfile) {
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
}

export async function deleteFamilyProfile(profileId: string, confirmationText?: string) {
  await fetchJson(`/api/profiles/${profileId}`, {
    method: 'DELETE',
    body: JSON.stringify({
      confirmationText,
    }),
  })
}

export async function logoutFamilyProfile() {
  await fetchJson('/api/session/logout', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}
