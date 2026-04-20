import type { ReviewRecord } from '@/utils/db/record'
import { putWordReviewRecord } from '@/utils/db/review-record'
import { atom } from 'jotai'
import { atomWithProfileStorage } from './profileStorage'

type TReviewInfoAtomData = {
  isReviewMode: boolean
  reviewRecord: ReviewRecord | undefined
}

export function reviewInfoAtom(initialValue: TReviewInfoAtomData) {
  const storageAtom = atomWithProfileStorage('reviewModeInfo', initialValue)

  return atom(
    (get) => {
      return get(storageAtom)
    },
    (get, set, updater: TReviewInfoAtomData | ((oldValue: TReviewInfoAtomData) => TReviewInfoAtomData)) => {
      const newValue = typeof updater === 'function' ? updater(get(storageAtom)) : updater

      // update reviewRecord to indexdb
      if (newValue.reviewRecord?.id) {
        putWordReviewRecord(newValue.reviewRecord)
      }
      set(storageAtom, newValue)
    },
  )
}
