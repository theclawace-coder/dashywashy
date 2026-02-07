// Quote Calculator - Server-side pricing logic
// Mirrors src/lib/quoteCalculator.ts for edge function use

export type ServiceType = 'general' | 'deep' | 'move'

export const SERVICE_HOURS: Record<ServiceType, Record<string, number>> = {
  general: {
    '1,1': 2.0,
    '2,1': 2.5,
    '2,2': 3.5,
    '3,2': 4.0,
    '4,2': 4.75,
    '4,3': 5.75,
    '5,3': 6.5,
    '6,3': 7.0,
  },
  deep: {
    '1,1': 3.5,
    '2,1': 4.0,
    '2,2': 5.0,
    '3,2': 6.0,
    '4,2': 7.25,
    '4,3': 8.5,
    '5,3': 9.75,
    '6,3': 11.0,
  },
  move: {
    '1,1': 5.0,
    '2,1': 6.0,
    '2,2': 7.0,
    '3,2': 8.0,
    '4,2': 9.5,
    '4,3': 10.5,
    '5,3': 11.0,
    '6,3': 12.5,
  },
}

export const STANDARD_ADD_ONS: Record<string, number> = {
  inside_oven_clean: 0.75,
  inside_fridge_clean: 0.75,
  inside_freezer_clean: 0.75,
  inside_windows_and_tracks: 1.5,
  blinds_up_to_5_sets: 0.75,
  balcony_clean: 0.75,
  garage_sweep_and_cobwebs: 0.75,
  carpet_steam_clean_1_room: 1.0,
  wall_spot_cleaning: 1.0,
  extra_bathroom: 1.0,
  extra_bedroom: 1.0,
}

export const ADDON_DISPLAY_NAMES: Record<string, string> = {
  inside_oven_clean: 'Inside Oven Clean',
  inside_fridge_clean: 'Inside Fridge Clean',
  inside_freezer_clean: 'Inside Freezer Clean',
  inside_windows_and_tracks: 'Inside Windows & Tracks',
  blinds_up_to_5_sets: 'Blinds (up to 5 sets)',
  balcony_clean: 'Balcony Clean',
  garage_sweep_and_cobwebs: 'Garage Sweep & Cobwebs',
  carpet_steam_clean_1_room: 'Carpet Steam Clean (1 room)',
  wall_spot_cleaning: 'Wall Spot Cleaning',
  extra_bathroom: 'Extra Bathroom',
  extra_bedroom: 'Extra Bedroom',
}

export const DEFAULT_PRICING = {
  CLIENT_HOURLY_RATE: 60,
  CLEANER_HOURLY_RATE: 35,
  GST_RATE: 0.1,
  DEFAULT_DISCOUNT_PCT: 10,
  DEFAULT_DEPOSIT_PCT: 0,
}

export type CustomAddOn = {
  name: string
  price: number
}

export type QuoteInput = {
  service: ServiceType
  bedrooms: number
  bathrooms: number
  addons: string[]
  customAddons: CustomAddOn[]
  clientHourlyRate: number
  cleanerHourlyRate: number
  cleanerRateType: 'hour' | 'job'
  discountApplied: boolean
  discountPercentage: number
  depositPercentage: number
}

export type QuoteResult = {
  mainServiceHours: number
  mainServiceCost: number
  addOnBreakdown: { key: string; hours: number; cost: number }[]
  totalAddOnHours: number
  totalAddOnCost: number
  totalCustomAddOnCost: number
  subtotal: number
  discountAmount: number
  netRevenue: number
  gst: number
  totalIncGst: number
  totalLaborHours: number
  cleanerPay: number
  profit: number
  profitMarginPct: number
  profitPerHour: number
  depositAmount: number
  remainingBalance: number
}

const round2 = (value: number) => Number(value.toFixed(2))
const round1 = (value: number) => Number(value.toFixed(1))

function validatePercent(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`${label} must be between 0 and 100`)
  }
}

function validatePositive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number`)
  }
}

function getMainServiceHours(service: ServiceType, bedrooms: number, bathrooms: number) {
  const key = `${bedrooms},${bathrooms}`
  const hours = SERVICE_HOURS[service]?.[key]
  if (!hours) {
    throw new Error(`Invalid bed/bath combo (${bedrooms} bed, ${bathrooms} bath) for ${service} service`)
  }
  return hours
}

export function calculateQuote(input: QuoteInput): QuoteResult {
  if (!['general', 'deep', 'move'].includes(input.service)) {
    throw new Error('Invalid service type')
  }

  validatePositive(input.clientHourlyRate, 'Client hourly rate')
  validatePositive(
    input.cleanerHourlyRate,
    input.cleanerRateType === 'job' ? 'Cleaner job pay' : 'Cleaner hourly rate'
  )
  validatePercent(input.discountPercentage, 'Discount percentage')
  validatePercent(input.depositPercentage, 'Deposit percentage')

  const mainServiceHours = getMainServiceHours(input.service, input.bedrooms, input.bathrooms)

  const addOnBreakdown = input.addons.map((key) => {
    const hours = STANDARD_ADD_ONS[key]
    if (!hours) {
      throw new Error(`Invalid add-on: ${key}`)
    }
    return {
      key,
      hours,
      cost: round2(hours * input.clientHourlyRate),
    }
  })

  const totalAddOnHours = addOnBreakdown.reduce((sum, item) => sum + item.hours, 0)
  const totalAddOnCost = addOnBreakdown.reduce((sum, item) => sum + item.cost, 0)

  const cleanedCustomAddons = (input.customAddons || []).map((addon) => ({
    name: addon.name?.trim() || 'Custom add-on',
    price: Math.max(0, Number(addon.price) || 0),
  }))
  cleanedCustomAddons.forEach((addon) => {
    if (!Number.isFinite(addon.price) || addon.price < 0) {
      throw new Error('Custom add-on prices must be zero or greater')
    }
  })

  const totalCustomAddOnCost = cleanedCustomAddons.reduce((sum, addon) => sum + addon.price, 0)

  const mainServiceCost = round2(mainServiceHours * input.clientHourlyRate)
  const subtotal = round2(mainServiceCost + totalAddOnCost + totalCustomAddOnCost)
  const discountAmount = input.discountApplied ? round2(subtotal * (input.discountPercentage / 100)) : 0
  const netRevenue = round2(subtotal - discountAmount)
  const gst = round2(netRevenue * DEFAULT_PRICING.GST_RATE)
  const totalIncGst = round2(netRevenue + gst)

  const totalLaborHours = mainServiceHours + totalAddOnHours
  const cleanerPay =
    input.cleanerRateType === 'job'
      ? round2(input.cleanerHourlyRate)
      : round2(totalLaborHours * input.cleanerHourlyRate)
  const profit = round2(netRevenue - cleanerPay)
  const profitMarginPct = netRevenue > 0 ? round1((profit / netRevenue) * 100) : 0
  const profitPerHour = totalLaborHours > 0 ? round2(profit / totalLaborHours) : 0

  const depositAmount = round2(totalIncGst * (input.depositPercentage / 100))
  const remainingBalance = round2(totalIncGst - depositAmount)

  return {
    mainServiceHours: round2(mainServiceHours),
    mainServiceCost,
    addOnBreakdown,
    totalAddOnHours: round2(totalAddOnHours),
    totalAddOnCost: round2(totalAddOnCost),
    totalCustomAddOnCost: round2(totalCustomAddOnCost),
    subtotal,
    discountAmount,
    netRevenue,
    gst,
    totalIncGst,
    totalLaborHours: round2(totalLaborHours),
    cleanerPay,
    profit,
    profitMarginPct,
    profitPerHour,
    depositAmount,
    remainingBalance,
  }
}

// Generate a human-readable quote number
export function generateQuoteNumber(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // Excluding I and O to avoid confusion
  const letter = letters[Math.floor(Math.random() * letters.length)]
  const number = Math.floor(1000 + Math.random() * 9000)
  return `${letter}${number}`
}

// Generate a share token for public quote links
export function generateShareToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let token = ''
  for (let i = 0; i < 16; i++) {
    token += chars[Math.floor(Math.random() * chars.length)]
  }
  return token
}
