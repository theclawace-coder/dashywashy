import type {
  BookingOccurrence,
  Cleaner,
  CleanerRecommendation,
  CleanerReviewStat,
  QuotePin,
} from '../types'

function overlaps(startA: number, endA: number, startB: number, endB: number) {
  return startA < endB && startB < endA
}

export function calculateDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const r = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return r * c
}

export function formatDistanceKm(value: number | null) {
  if (value === null) return 'Unknown'
  if (value < 1) return `${Math.round(value * 1000)}m`
  return `${value.toFixed(1)}km`
}

type RecommendationInput = {
  selectedJob: BookingOccurrence | null
  cleaners: Cleaner[]
  jobs: BookingOccurrence[]
  reviewStats: Record<string, CleanerReviewStat>
  quotePins: Record<string, QuotePin>
}

export function buildCleanerRecommendations({
  selectedJob,
  cleaners,
  jobs,
  reviewStats,
  quotePins,
}: RecommendationInput): CleanerRecommendation[] {
  if (!selectedJob) return []

  const selectedSeriesId = selectedJob.series?.id
  const selectedPin = selectedSeriesId ? quotePins[selectedSeriesId] : null
  const selectedLat = selectedPin?.lat ?? selectedJob.series?.service_lat
  const selectedLng = selectedPin?.lng ?? selectedJob.series?.service_lng

  const selectedStart = new Date(selectedJob.start_at).getTime()
  const selectedEnd = new Date(selectedJob.end_at).getTime()

  const activeCleaners = cleaners.filter((c) => c.active !== false)
  const recommendations: CleanerRecommendation[] = activeCleaners.map((cleaner) => {
    const cleanerJobs = jobs.filter(
      (j) =>
        j.cleaner_id === cleaner.id &&
        j.id !== selectedJob.id &&
        j.status !== 'cancelled'
    )

    const conflictCount = cleanerJobs.filter((j) =>
      overlaps(
        selectedStart,
        selectedEnd,
        new Date(j.start_at).getTime(),
        new Date(j.end_at).getTime()
      )
    ).length

    const workloadCount = cleanerJobs.length
    const canComputeDistance =
      typeof selectedLat === 'number' &&
      typeof selectedLng === 'number' &&
      typeof cleaner.base_lat === 'number' &&
      typeof cleaner.base_lng === 'number'
    const distanceKm = canComputeDistance
      ? calculateDistanceKm(cleaner.base_lat!, cleaner.base_lng!, selectedLat!, selectedLng!)
      : null

    const review = reviewStats[cleaner.id] || { avg: null, count: 0 }

    const availabilityScore = conflictCount === 0 ? 1 : 0
    const distanceScore =
      distanceKm === null ? 0.5 : Math.max(0, 1 - Math.min(distanceKm, 40) / 40)
    const reviewScore = review.avg === null ? 0.6 : Math.max(0, Math.min(1, review.avg / 5))
    const workloadScore = Math.max(0, 1 - Math.min(workloadCount, 6) / 6)

    const scoreBase =
      availabilityScore * 40 + distanceScore * 30 + reviewScore * 15 + workloadScore * 15
    const score = scoreBase - (conflictCount > 0 ? 25 : 0)

    const reasons: string[] = []
    if (conflictCount > 0) {
      reasons.push(`${conflictCount} time conflict${conflictCount === 1 ? '' : 's'}`)
    } else {
      reasons.push('No schedule conflicts')
    }
    if (distanceKm !== null) {
      reasons.push(`${formatDistanceKm(distanceKm)} travel`)
    } else {
      reasons.push('Distance unavailable')
    }
    if (review.avg !== null) {
      reasons.push(`${review.avg.toFixed(1)}/5 rating`)
    } else {
      reasons.push('No rating yet')
    }
    if (workloadCount > 0) {
      reasons.push(`${workloadCount} other job${workloadCount === 1 ? '' : 's'}`)
    }

    const status: CleanerRecommendation['status'] =
      conflictCount > 0 ? 'conflict' : workloadCount > 0 ? 'busy' : 'available'

    return {
      cleaner,
      score: Number(score.toFixed(2)),
      distanceKm,
      conflictCount,
      workloadCount,
      reviewAvg: review.avg,
      reviewCount: review.count,
      status,
      reasons,
    }
  })

  return recommendations.sort((a, b) => {
    if (a.conflictCount !== b.conflictCount) return a.conflictCount - b.conflictCount
    return b.score - a.score
  })
}

