import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type WheelEvent } from 'react'

export type CanvasNode = {
  id: string
  title: string
  subtitle?: string
  icon?: string
  kind: 'trigger' | 'action'
}

type AutomationCanvasProps = {
  nodes: CanvasNode[]
  selectedId: string | null
  isRunning?: boolean
  activeRunCount?: number
  onSelect: (id: string) => void
  onAddStep: () => void
}

type Point = { x: number; y: number }

type DragMode =
  | { type: 'none' }
  | { type: 'pan'; startX: number; startY: number; originX: number; originY: number }
  | { type: 'node'; nodeId: string; startX: number; startY: number; originX: number; originY: number }

const NODE_WIDTH = 260
const NODE_HEIGHT = 96
const SCENE_BASE_WIDTH = 2400
const SCENE_BASE_HEIGHT = 2000

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export default function AutomationCanvas({
  nodes,
  selectedId,
  isRunning = false,
  activeRunCount = 0,
  onSelect,
  onAddStep,
}: AutomationCanvasProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [camera, setCamera] = useState<Point>({ x: 120, y: 80 })
  const [isDragging, setIsDragging] = useState(false)
  const [nodePositions, setNodePositions] = useState<Record<string, Point>>({})

  const dragRef = useRef<DragMode>({ type: 'none' })
  const zoomRef = useRef(zoom)
  const layoutKey = useMemo(() => nodes.map((n) => n.id).join('|'), [nodes])

  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  useEffect(() => {
    setNodePositions((prev) => {
      const next: Record<string, Point> = {}
      let y = 120
      for (let index = 0; index < nodes.length; index += 1) {
        const node = nodes[index]
        next[node.id] = prev[node.id] || { x: 320 + (index % 2) * 24, y }
        y += 170
      }
      return next
    })
  }, [layoutKey, nodes])

  const fitToView = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport || nodes.length === 0) return

    const rects = nodes
      .map((node) => nodePositions[node.id])
      .filter(Boolean)
      .map((p) => ({
        left: p.x,
        top: p.y,
        right: p.x + NODE_WIDTH,
        bottom: p.y + NODE_HEIGHT,
      }))

    if (rects.length === 0) return

    const minX = Math.min(...rects.map((r) => r.left))
    const minY = Math.min(...rects.map((r) => r.top))
    const maxX = Math.max(...rects.map((r) => r.right))
    const maxY = Math.max(...rects.map((r) => r.bottom))

    const padding = 120
    const contentW = maxX - minX + padding * 2
    const contentH = maxY - minY + padding * 2

    const nextZoom = clamp(
      Math.min(viewport.clientWidth / contentW, viewport.clientHeight / contentH),
      0.45,
      1.75
    )

    const x = (viewport.clientWidth - (maxX - minX) * nextZoom) / 2 - minX * nextZoom
    const y = (viewport.clientHeight - (maxY - minY) * nextZoom) / 2 - minY * nextZoom

    setZoom(Number(nextZoom.toFixed(2)))
    setCamera({ x, y })
  }, [nodePositions, nodes])

  const autoArrange = useCallback(() => {
    const startX = 340
    const startY = 120
    const gapY = 164

    setNodePositions((prev) => {
      const next = { ...prev }
      nodes.forEach((node, index) => {
        next[node.id] = { x: startX + (index % 2) * 24, y: startY + index * gapY }
      })
      return next
    })

    window.setTimeout(() => fitToView(), 0)
  }, [fitToView, nodes])

  useEffect(() => {
    const timer = window.setTimeout(() => fitToView(), 0)
    return () => window.clearTimeout(timer)
  }, [fitToView, layoutKey])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const observer = new ResizeObserver(() => {
      fitToView()
    })
    observer.observe(viewport)

    return () => observer.disconnect()
  }, [fitToView])

  const handleBackgroundMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('[data-node]')) return

    dragRef.current = {
      type: 'pan',
      startX: e.clientX,
      startY: e.clientY,
      originX: camera.x,
      originY: camera.y,
    }
    setIsDragging(true)
  }

  const handleNodeMouseDown = (e: MouseEvent<HTMLButtonElement>, nodeId: string) => {
    if (e.button !== 0) return
    e.stopPropagation()

    const position = nodePositions[nodeId]
    if (!position) return

    dragRef.current = {
      type: 'node',
      nodeId,
      startX: e.clientX,
      startY: e.clientY,
      originX: position.x,
      originY: position.y,
    }
    setIsDragging(true)
    onSelect(nodeId)
  }

  useEffect(() => {
    if (!isDragging) return

    const onMouseMove = (e: globalThis.MouseEvent) => {
      const drag = dragRef.current
      if (drag.type === 'none') return

      const dx = e.clientX - drag.startX
      const dy = e.clientY - drag.startY

      if (drag.type === 'pan') {
        setCamera({
          x: drag.originX + dx,
          y: drag.originY + dy,
        })
        return
      }

      if (drag.type === 'node') {
        const factor = zoomRef.current || 1
        setNodePositions((prev) => ({
          ...prev,
          [drag.nodeId]: {
            x: drag.originX + dx / factor,
            y: drag.originY + dy / factor,
          },
        }))
      }
    }

    const onMouseUp = () => {
      dragRef.current = { type: 'none' }
      setIsDragging(false)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [isDragging])

  const handleWheel = (e: WheelEvent<HTMLDivElement>) => {
    e.preventDefault()

    const viewport = viewportRef.current
    if (!viewport) return

    const rect = viewport.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const scale = e.deltaY < 0 ? 1.08 : 0.92
    const nextZoom = clamp(Number((zoom * scale).toFixed(2)), 0.45, 1.9)

    const worldX = (mouseX - camera.x) / zoom
    const worldY = (mouseY - camera.y) / zoom

    setZoom(nextZoom)
    setCamera({
      x: mouseX - worldX * nextZoom,
      y: mouseY - worldY * nextZoom,
    })
  }

  const sceneBounds = useMemo(() => {
    const xs = nodes.map((node) => nodePositions[node.id]?.x ?? 0)
    const ys = nodes.map((node) => nodePositions[node.id]?.y ?? 0)
    const maxX = Math.max(SCENE_BASE_WIDTH, ...xs.map((x) => x + NODE_WIDTH + 360))
    const maxY = Math.max(SCENE_BASE_HEIGHT, ...ys.map((y) => y + NODE_HEIGHT + 320))
    return { width: maxX, height: maxY }
  }, [nodePositions, nodes])

  const linkPaths = useMemo(() => {
    const paths: Array<{ id: string; path: string }> = []

    for (let i = 0; i < nodes.length - 1; i += 1) {
      const from = nodePositions[nodes[i].id]
      const to = nodePositions[nodes[i + 1].id]
      if (!from || !to) continue

      const startX = from.x + NODE_WIDTH / 2
      const startY = from.y + NODE_HEIGHT
      const endX = to.x + NODE_WIDTH / 2
      const endY = to.y
      const curve = Math.max(58, Math.abs(endY - startY) * 0.42)
      const path = `M ${startX} ${startY} C ${startX} ${startY + curve}, ${endX} ${endY - curve}, ${endX} ${endY}`
      paths.push({ id: `${nodes[i].id}-${nodes[i + 1].id}`, path })
    }

    return paths
  }, [nodePositions, nodes])

  const lastNode = nodes.length > 0 ? nodes[nodes.length - 1] : null
  const lastNodePos = lastNode ? nodePositions[lastNode.id] : null
  const addButtonPosition = lastNodePos
    ? {
        x: lastNodePos.x + NODE_WIDTH / 2 - 52,
        y: lastNodePos.y + NODE_HEIGHT + 120,
      }
    : { x: 320, y: 260 }

  return (
    <div className="relative h-full">
      <div className="absolute left-4 top-4 z-20 flex items-center gap-2 rounded-full border border-cyan-300/20 bg-slate-900/80 px-3 py-1.5 shadow-[0_8px_30px_rgba(6,182,212,0.2)] backdrop-blur">
        <div className={`h-2.5 w-2.5 rounded-full ${isRunning ? 'bg-cyan-300 animate-pulse' : 'bg-white/40'}`} />
        <span className="text-[11px] uppercase tracking-[0.14em] text-cyan-100/85">
          {isRunning ? `Live Flow ${activeRunCount > 0 ? `(${activeRunCount})` : ''}` : 'Idle'}
        </span>
      </div>

      <div className="absolute right-4 top-4 z-20 flex items-center gap-1.5 rounded-full border border-cyan-300/20 bg-slate-900/80 px-2 py-1.5 shadow-[0_8px_30px_rgba(6,182,212,0.2)] backdrop-blur">
        <button
          type="button"
          className="px-2 py-1 text-xs text-cyan-100 hover:text-white"
          onClick={() => setZoom((z) => Math.max(0.6, Number((z - 0.1).toFixed(2))))}
        >
          -
        </button>
        <span className="min-w-12 text-center text-[11px] text-cyan-100/75">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          className="px-2 py-1 text-xs text-cyan-100 hover:text-white"
          onClick={() => setZoom((z) => Math.min(1.8, Number((z + 0.1).toFixed(2))))}
        >
          +
        </button>
        <button type="button" className="px-2 py-1 text-xs text-cyan-100 hover:text-white" onClick={fitToView}>
          Fit
        </button>
        <button type="button" className="px-2 py-1 text-xs text-cyan-100 hover:text-white" onClick={autoArrange}>
          Arrange
        </button>
        <button
          type="button"
          className="px-2 py-1 text-xs text-cyan-100 hover:text-white"
          onClick={() => {
            setZoom(1)
            setCamera({ x: 120, y: 80 })
          }}
        >
          Reset
        </button>
      </div>

      <div className="pointer-events-none absolute bottom-4 left-4 z-20 rounded-full border border-cyan-300/20 bg-slate-900/75 px-3 py-1 text-[10px] uppercase tracking-[0.12em] text-cyan-100/70 backdrop-blur">
        Drag nodes to move - Drag canvas to pan - Wheel to zoom
      </div>

      <div
        ref={viewportRef}
        onMouseDown={handleBackgroundMouseDown}
        onWheel={handleWheel}
        className={`relative h-full w-full overflow-hidden rounded-2xl border border-cyan-300/20 bg-slate-950 ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      >
        <div className="automation-canvas-grid absolute inset-0" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(6,182,212,0.18),transparent_45%),radial-gradient(circle_at_80%_70%,rgba(56,189,248,0.12),transparent_50%)]" />

        <div
          className="absolute left-0 top-0"
          style={{
            width: `${sceneBounds.width}px`,
            height: `${sceneBounds.height}px`,
            transform: `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
        >
          <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
            {linkPaths.map((link, index) => (
              <g key={link.id}>
                <path d={link.path} className="automation-flow-base" />
                {isRunning && (
                  <>
                    <path d={link.path} className="automation-flow-running" />
                    <circle r="4.5" className="automation-flow-pulse">
                      <animateMotion dur="1.6s" begin={`${index * 0.18}s`} repeatCount="indefinite" path={link.path} />
                    </circle>
                  </>
                )}
              </g>
            ))}
          </svg>

          {nodes.map((node) => {
            const position = nodePositions[node.id]
            if (!position) return null

            return (
              <button
                key={node.id}
                type="button"
                data-node
                onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                onClick={() => onSelect(node.id)}
                className={`absolute rounded-2xl border px-4 py-3 text-left shadow-xl backdrop-blur-sm transition-all ${
                  selectedId === node.id
                    ? 'border-cyan-300/80 bg-cyan-400/18'
                    : 'border-cyan-200/20 bg-slate-900/70 hover:bg-slate-800/75'
                } ${isRunning ? 'automation-node-running' : ''}`}
                style={{
                  left: position.x,
                  top: position.y,
                  width: NODE_WIDTH,
                  height: NODE_HEIGHT,
                }}
              >
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-400/20">
                    <span className="text-base">{node.icon || (node.kind === 'trigger' ? '?' : '?')}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{node.title}</p>
                    {node.subtitle && <p className="truncate text-[11px] text-cyan-100/70">{node.subtitle}</p>}
                  </div>
                  <span className="ml-auto rounded-full border border-cyan-200/20 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-cyan-100/60">
                    Drag
                  </span>
                </div>
              </button>
            )
          })}

          <button
            type="button"
            onClick={onAddStep}
            className="absolute h-24 w-24 rounded-full border border-dashed border-cyan-300/40 bg-slate-900/75 text-cyan-100/80 transition-colors hover:border-cyan-300 hover:text-white"
            style={{ left: addButtonPosition.x, top: addButtonPosition.y }}
          >
            + Add
          </button>
        </div>
      </div>
    </div>
  )
}
