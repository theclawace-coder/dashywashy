import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { GlassCard } from '../../../components/ui'
import type { BookingOccurrence, CleanerRecommendation, QuotePin } from '../types'

type DispatchCanvasProps = {
  mapboxToken: string | null
  mapboxError: string | null
  jobs: BookingOccurrence[]
  selectedJobId: string | null
  onSelectJob: (occurrenceId: string) => void
  quotePins: Record<string, QuotePin>
  recommendations: CleanerRecommendation[]
}

function createMarkerDot(color: string, borderColor: string, size = 12) {
  const el = document.createElement('button')
  el.type = 'button'
  el.style.width = `${size}px`
  el.style.height = `${size}px`
  el.style.borderRadius = '999px'
  el.style.border = `2px solid ${borderColor}`
  el.style.background = color
  el.style.cursor = 'pointer'
  return el
}

export function DispatchCanvas({
  mapboxToken,
  mapboxError,
  jobs,
  selectedJobId,
  onSelectJob,
  quotePins,
  recommendations,
}: DispatchCanvasProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])

  useEffect(() => {
    if (!mapboxToken || !mapContainerRef.current || mapRef.current) return
    ;(mapboxgl as any).accessToken = mapboxToken
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [151.2093, -33.8688],
      zoom: 10,
    })
    map.addControl(new mapboxgl.NavigationControl(), 'top-right')
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [mapboxToken])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    for (const marker of markersRef.current) marker.remove()
    markersRef.current = []

    const bounds = new mapboxgl.LngLatBounds()
    let hasBounds = false

    for (const job of jobs) {
      const seriesId = job.series?.id
      const pin = seriesId ? quotePins[seriesId] : null
      const lat = pin?.lat ?? job.series?.service_lat
      const lng = pin?.lng ?? job.series?.service_lng
      if (typeof lat !== 'number' || typeof lng !== 'number') continue

      const isSelected = selectedJobId === job.id
      const isAssigned = Boolean(job.cleaner_id)
      const markerEl = createMarkerDot(
        isSelected
          ? 'rgba(34,211,238,0.95)'
          : isAssigned
          ? 'rgba(34,197,94,0.9)'
          : 'rgba(245,158,11,0.95)',
        'rgba(255,255,255,0.9)',
        isSelected ? 16 : 12
      )
      markerEl.title = `${job.series?.lead?.name || 'Customer'} - ${job.series?.title || 'Job'}`
      markerEl.onclick = () => onSelectJob(job.id)

      const marker = new mapboxgl.Marker({ element: markerEl }).setLngLat([lng, lat]).addTo(map)
      markersRef.current.push(marker)
      bounds.extend([lng, lat])
      hasBounds = true
    }

    for (const rec of recommendations.slice(0, 5)) {
      const cleaner = rec.cleaner
      if (typeof cleaner.base_lat !== 'number' || typeof cleaner.base_lng !== 'number') continue
      const markerEl = createMarkerDot(
        rec.status === 'conflict' ? 'rgba(244,63,94,0.9)' : 'rgba(168,85,247,0.92)',
        'rgba(255,255,255,0.92)',
        11
      )
      markerEl.title = `${cleaner.full_name} (${Math.round(rec.score)})`
      const marker = new mapboxgl.Marker({ element: markerEl })
        .setLngLat([cleaner.base_lng, cleaner.base_lat])
        .addTo(map)
      markersRef.current.push(marker)
      bounds.extend([cleaner.base_lng, cleaner.base_lat])
      hasBounds = true
    }

    if (hasBounds) {
      map.fitBounds(bounds, { padding: 60, duration: 500, maxZoom: 13 })
    }
  }, [jobs, onSelectJob, quotePins, recommendations, selectedJobId])

  return (
    <GlassCard className="overflow-hidden h-full">
      <div className="p-4 border-b border-white/10">
        <div className="text-white font-semibold">Map Canvas</div>
        <div className="text-xs text-[var(--color-text-muted)] mt-1">
          Amber: unassigned jobs. Green: assigned jobs. Purple: top cleaner matches.
        </div>
      </div>
      {!mapboxToken ? (
        <div className="p-4 text-sm text-amber-200">
          Loading map token...
          {mapboxError ? ` ${mapboxError}` : null}
        </div>
      ) : null}
      {mapboxError ? (
        <div className="p-4 text-sm text-red-300 border-t border-white/10">
          Map issue: {mapboxError}
        </div>
      ) : null}
      <div ref={mapContainerRef} style={{ width: '100%', height: '70vh' }} />
    </GlassCard>
  )
}

