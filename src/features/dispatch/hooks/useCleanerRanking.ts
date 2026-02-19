import { useMemo } from 'react'
import type {
  BookingOccurrence,
  Cleaner,
  CleanerRecommendation,
  CleanerReviewStat,
  QuotePin,
} from '../types'
import { buildCleanerRecommendations } from '../utils/ranking'

type UseCleanerRankingInput = {
  selectedJob: BookingOccurrence | null
  cleaners: Cleaner[]
  jobs: BookingOccurrence[]
  reviewStats: Record<string, CleanerReviewStat>
  quotePins: Record<string, QuotePin>
}

export function useCleanerRanking({
  selectedJob,
  cleaners,
  jobs,
  reviewStats,
  quotePins,
}: UseCleanerRankingInput): CleanerRecommendation[] {
  return useMemo(
    () =>
      buildCleanerRecommendations({
        selectedJob,
        cleaners,
        jobs,
        reviewStats,
        quotePins,
      }),
    [selectedJob, cleaners, jobs, reviewStats, quotePins]
  )
}

