import { useFamily } from '../context'
import type { FamilyProfile } from '../service'
import { useMemo, useState } from 'react'

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Never'
  }

  return new Date(value).toLocaleString()
}

type ProfileManagerProps = {
  onClose?: () => void
  showCloseButton?: boolean
}

export default function ProfileManager({ onClose, showCloseButton = false }: ProfileManagerProps) {
  const { activeProfile, createProfile, deleteProfile, error, isLoading, lastSyncedAt, logout, profiles, refresh, runtimeMode, selectProfile, updateProfile } =
    useFamily()
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [welcomeMessage, setWelcomeMessage] = useState('')
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const activeProfileId = activeProfile?.id
  const statusLabel = runtimeMode === 'server' ? 'Synced with the family server' : 'Local preview mode until /api is available'
  const subtitle = useMemo(() => {
    if (!lastSyncedAt) {
      return statusLabel
    }

    return `${statusLabel} · Last sync ${formatDateTime(lastSyncedAt)}`
  }, [lastSyncedAt, statusLabel])

  const resetDraft = () => {
    setUsername('')
    setDisplayName('')
    setWelcomeMessage('')
    setEditingProfileId(null)
  }

  const handleSubmit = async () => {
    setPending(true)

    try {
      if (editingProfileId) {
        await updateProfile(editingProfileId, {
          displayName,
          welcomeMessage,
        })
      } else {
        await createProfile({
          username,
          displayName,
          welcomeMessage,
        })
      }
      resetDraft()
      onClose?.()
    } finally {
      setPending(false)
    }
  }

  const startEditing = (profile: FamilyProfile) => {
    setEditingProfileId(profile.id)
    setUsername(profile.username)
    setDisplayName(profile.displayName)
    setWelcomeMessage(profile.welcomeMessage)
  }

  const handleDelete = async (profile: FamilyProfile) => {
    const confirmation = window.prompt(
      `Type ${profile.username} to delete this family profile.\nExport a backup for this profile in Settings before deleting if you need a recovery copy.`,
      '',
    )

    if (confirmation !== profile.username) {
      return
    }

    setPending(true)
    try {
      await deleteProfile(profile.id)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="w-full max-w-5xl rounded-3xl border border-indigo-100 bg-white/95 p-6 shadow-2xl backdrop-blur dark:border-gray-700 dark:bg-gray-900/95">
      <div className="flex flex-col gap-3 border-b border-indigo-100 pb-6 dark:border-gray-700 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-500">Family shell</p>
          <h2 className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
            {activeProfile ? `Welcome back, ${activeProfile.displayName}` : 'Choose a family profile'}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-300">
            Username-only profiles keep each family member&apos;s local cache and practice history isolated while the backend sync contract comes online.
          </p>
          <p className="mt-2 text-xs font-medium text-gray-500 dark:text-gray-400">{subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button className="my-btn-primary" type="button" onClick={() => void refresh()} disabled={pending || isLoading}>
            Refresh
          </button>
          {activeProfile && (
            <button className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 dark:border-gray-600 dark:text-gray-200" type="button" onClick={() => void logout()} disabled={pending}>
              Logout
            </button>
          )}
          {showCloseButton && (
            <button className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 dark:border-gray-600 dark:text-gray-200" type="button" onClick={onClose}>
              Close
            </button>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.15fr,1fr]">
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-5 dark:border-gray-700 dark:bg-gray-800/80">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{editingProfileId ? 'Edit profile' : 'Create profile'}</h3>
          <div className="mt-4 space-y-4">
            <label className="flex flex-col gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
              Username
              <input
                className="rounded-xl border border-gray-300 px-3 py-2 text-base text-gray-900 outline-none transition focus:border-indigo-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                placeholder="alex"
                value={username}
                disabled={Boolean(editingProfileId)}
                onChange={(event) => setUsername(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
              Display name
              <input
                className="rounded-xl border border-gray-300 px-3 py-2 text-base text-gray-900 outline-none transition focus:border-indigo-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                placeholder="Alex"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
              Welcome message
              <textarea
                className="min-h-[96px] rounded-xl border border-gray-300 px-3 py-2 text-base text-gray-900 outline-none transition focus:border-indigo-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                placeholder="Ready for another typing session?"
                value={welcomeMessage}
                onChange={(event) => setWelcomeMessage(event.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <button className="my-btn-primary" type="button" disabled={pending || isLoading} onClick={() => void handleSubmit()}>
                {editingProfileId ? 'Save profile' : 'Create and select'}
              </button>
              {editingProfileId && (
                <button
                  className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 dark:border-gray-600 dark:text-gray-200"
                  type="button"
                  onClick={resetDraft}
                  disabled={pending}
                >
                  Cancel edit
                </button>
              )}
            </div>
            {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-200">{error}</p>}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Family profiles</h3>
            <span className="text-xs font-medium uppercase tracking-[0.2em] text-gray-500">{profiles.length} total</span>
          </div>
          <div className="mt-4 space-y-3">
            {profiles.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                Create the first family profile to enter the typing app.
              </div>
            ) : (
              profiles.map((profile) => {
                const isActive = profile.id === activeProfileId

                return (
                  <div
                    key={profile.id}
                    className={`rounded-2xl border px-4 py-4 transition ${
                      isActive
                        ? 'border-indigo-400 bg-indigo-50/80 shadow-sm dark:border-indigo-500 dark:bg-indigo-950/40'
                        : 'border-gray-200 bg-gray-50/80 dark:border-gray-700 dark:bg-gray-800/60'
                    }`}
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-lg font-semibold text-gray-900 dark:text-white">{profile.displayName}</h4>
                          <span className="rounded-full bg-gray-900/5 px-2 py-1 text-xs font-semibold text-gray-600 dark:bg-white/10 dark:text-gray-300">
                            @{profile.username}
                          </span>
                          {isActive && (
                            <span className="rounded-full bg-indigo-500 px-2 py-1 text-xs font-semibold text-white">Active</span>
                          )}
                        </div>
                        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{profile.welcomeMessage}</p>
                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                          Last seen {formatDateTime(profile.lastSeenAt)} · Updated {formatDateTime(profile.updatedAt)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {!isActive && (
                          <button className="my-btn-primary" type="button" disabled={pending} onClick={() => void selectProfile(profile)}>
                            Switch
                          </button>
                        )}
                        <button
                          className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 dark:border-gray-600 dark:text-gray-200"
                          type="button"
                          disabled={pending}
                          onClick={() => startEditing(profile)}
                        >
                          Edit
                        </button>
                        <button
                          className="rounded-xl border border-red-300 px-3 py-2 text-sm font-semibold text-red-600 dark:border-red-800 dark:text-red-300"
                          type="button"
                          disabled={pending}
                          onClick={() => void handleDelete(profile)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
