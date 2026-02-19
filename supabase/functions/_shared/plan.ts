export type OrgPlan = 'free' | 'growth' | 'unlimited'

export interface PlanConfig {
  id: OrgPlan
  label: string
  monthlyJobLimit: number | null
  aiEnabled: boolean
}

const PLAN_ALIASES: Record<string, OrgPlan> = {
  starter: 'growth',
  pro: 'unlimited',
  enterprise: 'unlimited',
}

const PLAN_CONFIGS: Record<OrgPlan, PlanConfig> = {
  free: {
    id: 'free',
    label: 'Free',
    monthlyJobLimit: 10,
    aiEnabled: false,
  },
  growth: {
    id: 'growth',
    label: 'Growth',
    monthlyJobLimit: 100,
    aiEnabled: true,
  },
  unlimited: {
    id: 'unlimited',
    label: 'Unlimited',
    monthlyJobLimit: null,
    aiEnabled: true,
  },
}

export function normalizePlan(plan: unknown): OrgPlan {
  if (typeof plan !== 'string' || !plan.trim()) return 'free'
  const key = plan.toLowerCase()
  if (key in PLAN_ALIASES) return PLAN_ALIASES[key]
  if (key === 'free' || key === 'growth' || key === 'unlimited') return key
  return 'free'
}

export function getPlanConfig(plan: unknown): PlanConfig {
  return PLAN_CONFIGS[normalizePlan(plan)]
}

export function getUtcMonthBounds(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0))
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0, 0))
  return { start, end }
}