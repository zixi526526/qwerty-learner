const USERNAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{1,30}$/
const MAX_WELCOME_LENGTH = 160
const MAX_DISPLAY_NAME_LENGTH = 48

function normalizeUsername(username) {
  return String(username ?? '')
    .trim()
    .toLowerCase()
}

function validateUsername(username) {
  const trimmed = String(username ?? '').trim()
  const normalized = normalizeUsername(trimmed)

  if (!trimmed) {
    return { ok: false, message: 'Username is required.' }
  }

  if (!USERNAME_PATTERN.test(trimmed)) {
    return {
      ok: false,
      message: 'Username must be 2-31 characters and use only letters, numbers, underscores, or hyphens.',
    }
  }

  return { ok: true, trimmed, normalized }
}

function sanitizeDisplayName(displayName, fallbackUsername) {
  const value = String(displayName ?? '').trim() || fallbackUsername
  return value.slice(0, MAX_DISPLAY_NAME_LENGTH)
}

function sanitizeWelcomeMessage(welcomeMessage) {
  return String(welcomeMessage ?? '').trim().slice(0, MAX_WELCOME_LENGTH)
}

module.exports = {
  MAX_WELCOME_LENGTH,
  normalizeUsername,
  sanitizeDisplayName,
  sanitizeWelcomeMessage,
  validateUsername,
}
