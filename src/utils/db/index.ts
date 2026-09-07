import type { IChapterRecord, IReviewRecord, IRevisionDictRecord, IWordRecord, LetterMistakes } from './record'
import { ChapterRecord, ReviewRecord, WordRecord } from './record'
import { syncPracticeBatch } from '@/family/practiceSync'
import { getActiveProfileNamespace, getProfileScopedDbName } from '@/family/storage'
import { TypingContext, TypingStateActionType } from '@/pages/Typing/store'
import type { TypingState } from '@/pages/Typing/store/type'
import { currentChapterAtom, currentDictIdAtom, isReviewModeAtom } from '@/store'
import type { Table } from 'dexie'
import Dexie from 'dexie'
import { useAtomValue } from 'jotai'
import { useCallback, useContext } from 'react'

class RecordDB extends Dexie {
  wordRecords!: Table<IWordRecord, number>
  chapterRecords!: Table<IChapterRecord, number>
  reviewRecords!: Table<IReviewRecord, number>

  revisionDictRecords!: Table<IRevisionDictRecord, number>
  revisionWordRecords!: Table<IWordRecord, number>

  constructor(name: string) {
    super(name)
    this.version(1).stores({
      wordRecords: '++id,word,timeStamp,dict,chapter,errorCount,[dict+chapter]',
      chapterRecords: '++id,timeStamp,dict,chapter,time,[dict+chapter]',
    })
    this.version(2).stores({
      wordRecords: '++id,word,timeStamp,dict,chapter,wrongCount,[dict+chapter]',
      chapterRecords: '++id,timeStamp,dict,chapter,time,[dict+chapter]',
    })
    this.version(3).stores({
      wordRecords: '++id,word,timeStamp,dict,chapter,wrongCount,[dict+chapter]',
      chapterRecords: '++id,timeStamp,dict,chapter,time,[dict+chapter]',
      reviewRecords: '++id,dict,createTime,isFinished',
    })
    this.version(4).stores({
      wordRecords: '++id,recordId,updatedAt,word,timeStamp,dict,chapter,wrongCount,[dict+chapter]',
      chapterRecords: '++id,recordId,updatedAt,timeStamp,dict,chapter,time,[dict+chapter]',
      reviewRecords: '++id,recordId,updatedAt,dict,createTime,isFinished',
    })
  }
}

const dbInstances = new Map<string, RecordDB>()

function createDbForName(name: string) {
  const db = new RecordDB(name)
  db.wordRecords.mapToClass(WordRecord)
  db.chapterRecords.mapToClass(ChapterRecord)
  db.reviewRecords.mapToClass(ReviewRecord)
  return db
}

function createDb(namespace = getActiveProfileNamespace()) {
  return createDbForName(getProfileScopedDbName(namespace))
}

function getDbInstance(namespace = getActiveProfileNamespace()) {
  if (!dbInstances.has(namespace)) {
    dbInstances.set(namespace, createDb(namespace))
  }

  const instance = dbInstances.get(namespace)
  if (!instance) {
    throw new Error(`Missing Dexie instance for namespace ${namespace}`)
  }

  return instance
}

let activeNamespace = getActiveProfileNamespace()
let activeDb = getDbInstance(activeNamespace)

export function setActiveDbNamespace(namespace?: string | null) {
  activeNamespace = namespace || 'guest'
  activeDb = getDbInstance(activeNamespace)
  return activeDb
}

export function getActiveDb() {
  return activeDb
}

export type PracticeSnapshot = {
  wordRecords?: IWordRecord[]
  chapterRecords?: IChapterRecord[]
  reviewRecords?: IReviewRecord[]
}

// `id` is Dexie's per-device autoincrement key, so it is meaningless on any other
// device. Records are matched across devices by `recordId` instead.
type SyncableRecord = { id?: number; recordId?: string; updatedAt?: string }

function isNewer(candidate: string | undefined, reference: string | undefined) {
  if (!candidate) return false
  if (!reference) return true
  // updatedAt is ISO-8601, which sorts correctly as a plain string.
  return candidate > reference
}

async function mergeTable<T extends SyncableRecord>(table: Table<T, number>, incoming: T[] | undefined): Promise<T[]> {
  const localRecords = await table.toArray()
  const localByRecordId = new Map<string, T>()
  for (const record of localRecords) {
    if (record.recordId) {
      localByRecordId.set(record.recordId, record)
    }
  }

  const pendingUploads: T[] = []
  const seenRecordIds = new Set<string>()

  for (const incomingRecord of incoming ?? []) {
    if (!incomingRecord?.recordId) continue
    seenRecordIds.add(incomingRecord.recordId)

    const localRecord = localByRecordId.get(incomingRecord.recordId)
    const { id: _incomingDeviceId, ...withoutDeviceId } = incomingRecord

    if (!localRecord) {
      await table.add(withoutDeviceId as T)
      continue
    }

    if (isNewer(incomingRecord.updatedAt, localRecord.updatedAt)) {
      await table.put({ ...withoutDeviceId, id: localRecord.id } as T)
    } else if (isNewer(localRecord.updatedAt, incomingRecord.updatedAt)) {
      pendingUploads.push(localRecord)
    }
  }

  // Anything the incoming snapshot never mentioned only exists on this device and
  // still needs to reach the server. Clearing the table instead (as this used to do)
  // silently destroyed every record that had not been synced yet.
  for (const localRecord of localRecords) {
    if (localRecord.recordId && !seenRecordIds.has(localRecord.recordId)) {
      pendingUploads.push(localRecord)
    }
  }

  return pendingUploads
}

/**
 * Reconciles the server snapshot into this device's practice history and reports the
 * records the server is still missing, so the caller can push them back up.
 */
export async function mergePracticeSnapshot(snapshot: PracticeSnapshot): Promise<PracticeSnapshot> {
  const dbInstance = getActiveDb()

  return dbInstance.transaction('rw', dbInstance.wordRecords, dbInstance.chapterRecords, dbInstance.reviewRecords, async () => ({
    wordRecords: await mergeTable(dbInstance.wordRecords, snapshot.wordRecords),
    chapterRecords: await mergeTable(dbInstance.chapterRecords, snapshot.chapterRecords),
    reviewRecords: await mergeTable(dbInstance.reviewRecords, snapshot.reviewRecords),
  }))
}

export function practiceSnapshotSize(snapshot: PracticeSnapshot) {
  return (snapshot.wordRecords?.length ?? 0) + (snapshot.chapterRecords?.length ?? 0) + (snapshot.reviewRecords?.length ?? 0)
}

const LEGACY_DB_NAME = 'RecordDB'
const LEGACY_DB_ADOPTED_KEY = 'family.legacyDbAdopted'

// Records written before the family profiles landed have no recordId/updatedAt. Derive
// both from the record's own natural key so that adopting the same legacy database on
// two devices converges on one copy instead of duplicating the history.
function withSyncIdentity<T extends SyncableRecord>(record: T, fallbackRecordId: string, fallbackSeconds: number): T {
  const { id: _deviceLocalId, ...withoutDeviceId } = record

  return {
    ...withoutDeviceId,
    recordId: record.recordId || fallbackRecordId,
    updatedAt: record.updatedAt || new Date(fallbackSeconds * 1000).toISOString(),
  } as T
}

/**
 * Takes over the pre-profile `RecordDB` database, if one is still around, and returns
 * its contents so they can be merged into the active profile. This used to simply
 * delete the database, which threw away every practice record made before upgrading.
 */
export async function adoptLegacyGuestDb(): Promise<PracticeSnapshot | null> {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null
  }

  if (window.localStorage.getItem(LEGACY_DB_ADOPTED_KEY) === 'done') {
    return null
  }

  try {
    if (!(await Dexie.exists(LEGACY_DB_NAME))) {
      window.localStorage.setItem(LEGACY_DB_ADOPTED_KEY, 'done')
      return null
    }

    const legacyDb = createDbForName(LEGACY_DB_NAME)
    const [wordRecords, chapterRecords, reviewRecords] = await Promise.all([
      legacyDb.wordRecords.toArray(),
      legacyDb.chapterRecords.toArray(),
      legacyDb.reviewRecords.toArray(),
    ])

    const snapshot: PracticeSnapshot = {
      wordRecords: wordRecords.map((record) =>
        withSyncIdentity(record, `legacy-word-${record.dict}-${record.chapter}-${record.word}-${record.timeStamp}`, record.timeStamp),
      ),
      chapterRecords: chapterRecords.map((record) =>
        withSyncIdentity(record, `legacy-chapter-${record.dict}-${record.chapter}-${record.timeStamp}`, record.timeStamp),
      ),
      reviewRecords: reviewRecords.map((record) =>
        withSyncIdentity(record, `legacy-review-${record.dict}-${record.createTime}`, record.createTime),
      ),
    }

    legacyDb.close()
    await Dexie.delete(LEGACY_DB_NAME)
    window.localStorage.setItem(LEGACY_DB_ADOPTED_KEY, 'done')

    return snapshot
  } catch (error) {
    // Leave the legacy database in place so a later attempt can still rescue it.
    console.warn('Failed to adopt the legacy RecordDB history', error)
    return null
  }
}

export const db = new Proxy({} as RecordDB, {
  get(_target, prop, receiver) {
    const value = Reflect.get(getActiveDb(), prop, receiver)
    return typeof value === 'function' ? value.bind(getActiveDb()) : value
  },
}) as RecordDB

export function useSaveChapterRecord() {
  const currentChapter = useAtomValue(currentChapterAtom)
  const isRevision = useAtomValue(isReviewModeAtom)
  const dictID = useAtomValue(currentDictIdAtom)

  const saveChapterRecord = useCallback(
    async (typingState: TypingState) => {
      try {
        const {
          chapterData: { correctCount, wrongCount, userInputLogs, wordCount, words, wordRecordIds },
          timerData: { time },
        } = typingState
        const correctWordIndexes = userInputLogs.filter((log) => log.correctCount > 0 && log.wrongCount === 0).map((log) => log.index)

        const chapterRecord = new ChapterRecord(
          dictID,
          isRevision ? -1 : currentChapter,
          time,
          correctCount,
          wrongCount,
          wordCount,
          correctWordIndexes,
          words.length,
          wordRecordIds ?? [],
        )

        const syncedWordRecords =
          wordRecordIds && wordRecordIds.length > 0
            ? (await db.wordRecords.bulkGet(wordRecordIds)).filter((record): record is IWordRecord => Boolean(record))
            : []

        // Persist locally first. Syncing first meant a server hiccup threw before the
        // local write and the chapter was lost from both sides.
        await db.chapterRecords.add(chapterRecord)

        try {
          await syncPracticeBatch({
            wordRecords: syncedWordRecords,
            chapterRecords: [chapterRecord],
          })
        } catch (syncError) {
          // The record is safe on this device and the next bootstrap merge pushes it up.
          console.error(syncError)
        }
      } catch (error) {
        console.error(error)
      }
    },
    [currentChapter, dictID, isRevision],
  )

  return saveChapterRecord
}

export type WordKeyLogger = {
  letterTimeArray: number[]
  letterMistake: LetterMistakes
}

export function useSaveWordRecord() {
  const isRevision = useAtomValue(isReviewModeAtom)
  const currentChapter = useAtomValue(currentChapterAtom)
  const dictID = useAtomValue(currentDictIdAtom)

  const { dispatch } = useContext(TypingContext) ?? {}

  const saveWordRecord = useCallback(
    async ({
      word,
      wrongCount,
      letterTimeArray,
      letterMistake,
    }: {
      word: string
      wrongCount: number
      letterTimeArray: number[]
      letterMistake: LetterMistakes
    }) => {
      const timing = []
      for (let i = 1; i < letterTimeArray.length; i++) {
        const diff = letterTimeArray[i] - letterTimeArray[i - 1]
        timing.push(diff)
      }

      const wordRecord = new WordRecord(word, dictID, isRevision ? -1 : currentChapter, timing, wrongCount, letterMistake)

      let dbID = -1
      try {
        dbID = await db.wordRecords.add(wordRecord)
      } catch (e) {
        console.error(e)
      }
      if (dispatch) {
        dbID > 0 && dispatch({ type: TypingStateActionType.ADD_WORD_RECORD_ID, payload: dbID })
        dispatch({ type: TypingStateActionType.SET_IS_SAVING_RECORD, payload: false })
      }
    },
    [currentChapter, dictID, dispatch, isRevision],
  )

  return saveWordRecord
}

export function useDeleteWordRecord() {
  const deleteWordRecord = useCallback(async (word: string, dict: string) => {
    try {
      const deletedCount = await db.wordRecords.where({ word, dict }).delete()
      return deletedCount
    } catch (error) {
      console.error(`删除单词记录时出错：`, error)
    }
  }, [])

  return { deleteWordRecord }
}
