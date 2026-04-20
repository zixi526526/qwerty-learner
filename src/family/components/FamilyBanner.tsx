import ProfileManager from './ProfileManager'
import { useFamily } from '../context'
import { useState } from 'react'

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Not synced yet'
  }

  return new Date(value).toLocaleString()
}

export default function FamilyBanner() {
  const { activeProfile, lastSyncedAt, logout, runtimeMode } = useFamily()
  const [isManagerOpen, setIsManagerOpen] = useState(false)

  if (!activeProfile) {
    return null
  }

  return (
    <>
      <div className="container z-10 mx-auto mt-4 flex w-full flex-col gap-3 rounded-3xl border border-indigo-100 bg-white/95 px-5 py-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/90 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-indigo-500 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white">
              {runtimeMode === 'server' ? 'Server session' : 'Local preview'}
            </span>
            <span className="text-sm font-semibold text-gray-900 dark:text-white">
              {activeProfile.displayName} · @{activeProfile.username}
            </span>
          </div>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{activeProfile.welcomeMessage}</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Last sync: {formatDateTime(lastSyncedAt)}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button className="my-btn-primary" type="button" onClick={() => setIsManagerOpen(true)}>
            Manage profiles
          </button>
          <button
            className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 dark:border-gray-600 dark:text-gray-200"
            type="button"
            onClick={() => void logout()}
          >
            Logout
          </button>
        </div>
      </div>

      {isManagerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-sm">
          <ProfileManager onClose={() => setIsManagerOpen(false)} showCloseButton />
        </div>
      )}
    </>
  )
}
