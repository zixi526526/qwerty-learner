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

function createDb(namespace = getActiveProfileNamespace()) {
  const db = new RecordDB(getProfileScopedDbName(namespace))
  db.wordRecords.mapToClass(WordRecord)
  db.chapterRecords.mapToClass(ChapterRecord)
  db.reviewRecords.mapToClass(ReviewRecord)
  return db
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

export async function replacePracticeSnapshot(snapshot: {
  wordRecords?: IWordRecord[]
  chapterRecords?: IChapterRecord[]
  reviewRecords?: IReviewRecord[]
}) {
  const dbInstance = getActiveDb()
  await dbInstance.transaction('rw', dbInstance.wordRecords, dbInstance.chapterRecords, dbInstance.reviewRecords, async () => {
    await Promise.all([dbInstance.wordRecords.clear(), dbInstance.chapterRecords.clear(), dbInstance.reviewRecords.clear()])

    if (snapshot.wordRecords?.length) {
      await dbInstance.wordRecords.bulkPut(snapshot.wordRecords)
    }

    if (snapshot.chapterRecords?.length) {
      await dbInstance.chapterRecords.bulkPut(snapshot.chapterRecords)
    }

    if (snapshot.reviewRecords?.length) {
      await dbInstance.reviewRecords.bulkPut(snapshot.reviewRecords)
    }
  })
}

export async function clearLegacyGuestDb() {
  const legacyDb = new RecordDB('RecordDB')
  try {
    await legacyDb.delete()
  } catch (error) {
    console.warn('Failed to delete legacy RecordDB cache', error)
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

        await syncPracticeBatch({
          wordRecords: syncedWordRecords,
          chapterRecords: [chapterRecord],
        })
        await db.chapterRecords.add(chapterRecord)
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
