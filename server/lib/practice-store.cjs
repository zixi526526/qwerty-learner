const PRACTICE_TABLES = {
  wordRecords: 'practice_word_records',
  chapterRecords: 'practice_chapter_records',
  reviewRecords: 'practice_review_records',
}

function parsePayload(payload) {
  try {
    return JSON.parse(payload)
  } catch {
    return null
  }
}

function serializePayload(payload) {
  return JSON.stringify(payload ?? {})
}

function listPracticeRecords(db, profileId) {
  return {
    wordRecords: listRecordsForTable(db, PRACTICE_TABLES.wordRecords, profileId),
    chapterRecords: listRecordsForTable(db, PRACTICE_TABLES.chapterRecords, profileId),
    reviewRecords: listRecordsForTable(db, PRACTICE_TABLES.reviewRecords, profileId),
  }
}

function listRecordsForTable(db, tableName, profileId) {
  return db
    .prepare(`SELECT payload FROM ${tableName} WHERE profile_id = ? ORDER BY updated_at ASC, record_id ASC`)
    .all(profileId)
    .map((row) => parsePayload(row.payload))
    .filter(Boolean)
}

function upsertPracticeRecords(db, profileId, payload = {}) {
  const transaction = db.transaction(() => {
    const wordRecords = upsertRecordsForTable(db, PRACTICE_TABLES.wordRecords, profileId, payload.wordRecords)
    const chapterRecords = upsertRecordsForTable(db, PRACTICE_TABLES.chapterRecords, profileId, payload.chapterRecords)
    const reviewRecords = upsertRecordsForTable(db, PRACTICE_TABLES.reviewRecords, profileId, payload.reviewRecords)

    return {
      wordRecords,
      chapterRecords,
      reviewRecords,
    }
  })

  return transaction()
}

function upsertRecordsForTable(db, tableName, profileId, records) {
  if (!Array.isArray(records) || records.length === 0) {
    return []
  }

  const upsertStatement = db.prepare(
    `INSERT INTO ${tableName} (record_id, profile_id, payload, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(record_id) DO UPDATE SET
       payload = excluded.payload,
       updated_at = excluded.updated_at
     WHERE excluded.updated_at >= ${tableName}.updated_at`,
  )

  const acceptedRecords = []

  for (const record of records) {
    const normalized = normalizePracticeRecord(record)
    if (!normalized) {
      continue
    }

    upsertStatement.run(normalized.recordId, profileId, serializePayload(normalized), normalized.updatedAt)
    acceptedRecords.push(normalized)
  }

  return acceptedRecords
}

function normalizePracticeRecord(record) {
  if (!record || typeof record !== 'object') {
    return null
  }

  const recordId = typeof record.recordId === 'string' ? record.recordId.trim() : ''
  const updatedAt = typeof record.updatedAt === 'string' ? record.updatedAt : ''

  if (!recordId || !updatedAt) {
    return null
  }

  return { ...record, recordId, updatedAt }
}

module.exports = {
  PRACTICE_TABLES,
  listPracticeRecords,
  upsertPracticeRecords,
}
