import type { IChapterRecord, IReviewRecord, IWordRecord } from '@/utils/db/record'

type PracticeSyncContext = {
  enabled: boolean
}

const practiceSyncContext: PracticeSyncContext = {
  enabled: false,
}

async function putPractice(payload: {
  wordRecords?: IWordRecord[]
  chapterRecords?: IChapterRecord[]
  reviewRecords?: IReviewRecord[]
}) {
  if (!practiceSyncContext.enabled) {
    return
  }

  const response = await fetch('/api/sync/practice', {
    method: 'PUT',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(payload?.error || 'Unable to sync practice data')
  }
}

export function configurePracticeSync(enabled: boolean) {
  practiceSyncContext.enabled = enabled
}

export async function syncWordRecord(record: IWordRecord) {
  await putPractice({ wordRecords: [record] })
}

export async function syncChapterRecord(record: IChapterRecord) {
  await putPractice({ chapterRecords: [record] })
}

export async function syncReviewRecord(record: IReviewRecord) {
  await putPractice({ reviewRecords: [record] })
}

export async function syncPracticeBatch(payload: {
  wordRecords?: IWordRecord[]
  chapterRecords?: IChapterRecord[]
  reviewRecords?: IReviewRecord[]
}) {
  await putPractice(payload)
}
