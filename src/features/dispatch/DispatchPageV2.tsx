import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../lib/auth'
import { fetchMapboxToken } from '../../lib/mapbox'
import { Button } from '../../components/ui'
import { AssignmentInspector } from './components/AssignmentInspector'
import { DispatchCanvas } from './components/DispatchCanvas'
import { DispatchHeader } from './components/DispatchHeader'
import { DispatchKpis } from './components/DispatchKpis'
import { NeedsActionQueue } from './components/NeedsActionQueue'
import { useAssignCleaner } from './hooks/useAssignCleaner'
import { useCleanerRanking } from './hooks/useCleanerRanking'
import { useDispatchBoard } from './hooks/useDispatchBoard'
import { useDispatchRealtime } from './hooks/useDispatchRealtime'
import type { CleanerRecommendation } from './types'

export default function DispatchPageV2() {
  const { currentOrg } = useAuth()
  const board = useDispatchBoard(currentOrg?.id)

  const [searchQuery, setSearchQuery] = useState('')
  const [mapboxToken, setMapboxToken] = useState<string | null>(null)
  const [mapboxError, setMapboxError] = useState<string | null>(null)
  const [infoMessage, setInfoMessage] = useState<string | null>(null)

  useDispatchRealtime(currentOrg?.id, board.refresh)

  useEffect(() => {
    if (!currentOrg?.id) return
    fetchMapboxToken(currentOrg.id)
      .then((token) => {
        setMapboxToken(token)
        setMapboxError(null)
      })
      .catch((err) => {
        setMapboxError(err instanceof Error ? err.message : 'Unable to load map token')
      })
  }, [currentOrg?.id])

  const queueJobs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return board.unassignedJobs
    return board.unassignedJobs.filter((job) => {
      const title = `${job.series?.lead?.name || ''} ${job.series?.title || ''}`.toLowerCase()
      const address =
        (
          board.quotePins[job.series?.id || '']?.address ||
          job.series?.service_address ||
          ''
        ).toLowerCase()
      return title.includes(q) || address.includes(q)
    })
  }, [board.quotePins, board.unassignedJobs, searchQuery])

  const recommendations = useCleanerRanking({
    selectedJob: board.selectedJob,
    cleaners: board.cleaners,
    jobs: board.jobs,
    reviewStats: board.reviewStats,
    quotePins: board.quotePins,
  })

  const {
    assigningOccurrenceId,
    actionError,
    pendingUndo,
    undoSecondsRemaining,
    assignCleaner,
    undoLastAssignment,
  } = useAssignCleaner({
    orgId: currentOrg?.id,
    onAssigned: board.refresh,
  })

  const handleAssign = async (rec: CleanerRecommendation, sendSms: boolean) => {
    if (!board.selectedJob) return
    const seriesId = board.selectedJob.series?.id || ''
    const quotePin = board.quotePins[seriesId]
    const result = await assignCleaner({
      occurrenceId: board.selectedJob.id,
      cleanerId: rec.cleaner.id,
      previousCleanerId: board.selectedJob.cleaner_id,
      cleanerName: rec.cleaner.full_name,
      cleanerPhone: rec.cleaner.phone,
      jobLabel: `${board.selectedJob.series?.lead?.name || 'Customer'} - ${
        board.selectedJob.series?.title || 'Job'
      }`,
      jobAddress: quotePin?.address || board.selectedJob.series?.service_address || null,
      jobStartAt: board.selectedJob.start_at,
      sendSms,
    })

    if (result.ok) {
      if (result.smsWarning) {
        setInfoMessage(`Assigned ${rec.cleaner.full_name}. SMS warning: ${result.smsWarning}`)
      } else {
        setInfoMessage(
          sendSms
            ? `Assigned ${rec.cleaner.full_name} and sent SMS.`
            : `Assigned ${rec.cleaner.full_name}.`
        )
      }
    }
  }

  if (!currentOrg) return null

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <DispatchHeader
          selectedDate={board.selectedDate}
          onDateChange={board.setSelectedDate}
          viewMode={board.viewMode}
          onViewModeChange={board.setViewMode}
        />

        <DispatchKpis
          unassignedCount={board.unassignedJobs.length}
          assignedCount={board.assignedJobs.length}
          activeCleaners={board.cleaners.filter((c) => c.active !== false).length}
        />

        {board.loading ? (
          <div className="mb-4 p-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white/80">
            Loading dispatch board...
          </div>
        ) : null}
        {board.error ? (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-200">
            {board.error}
          </div>
        ) : null}
        {actionError ? (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-200">
            {actionError}
          </div>
        ) : null}
        {infoMessage ? (
          <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-sm text-emerald-100">
            {infoMessage}
          </div>
        ) : null}

        {pendingUndo ? (
          <div className="mb-4 p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-sm text-cyan-100 flex items-center justify-between gap-3">
            <span>Assignment updated. Undo available for {undoSecondsRemaining}s.</span>
            <Button size="sm" variant="secondary" onClick={() => void undoLastAssignment()}>
              Undo
            </Button>
          </div>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-3">
            <NeedsActionQueue
              jobs={queueJobs}
              selectedJobId={board.selectedJobId}
              onSelectJob={board.setSelectedJobId}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              quotePins={board.quotePins}
            />
          </div>
          <div className="lg:col-span-5">
            <DispatchCanvas
              mapboxToken={mapboxToken}
              mapboxError={mapboxError}
              jobs={board.jobs}
              selectedJobId={board.selectedJobId}
              onSelectJob={board.setSelectedJobId}
              quotePins={board.quotePins}
              recommendations={recommendations}
            />
          </div>
          <div className="lg:col-span-4">
            <AssignmentInspector
              selectedJob={board.selectedJob}
              recommendations={recommendations}
              quotePins={board.quotePins}
              assigningOccurrenceId={assigningOccurrenceId}
              onAssign={handleAssign}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

