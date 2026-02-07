import { test, expect } from '@playwright/test'
import { loginAsSeedUser, waitForAppReady } from './helpers/auth'
import { ensureLeadForToday } from './helpers/supabaseAdmin'

test.describe('Quote flow', () => {
  test('creates and saves a quote from a dashboard lead', async ({ page }) => {
    await ensureLeadForToday()
    await loginAsSeedUser(page)
    await page.goto('/dashboard')
    await waitForAppReady(page)

    await expect(page.getByRole('heading', { name: /Today's Leads/i })).toBeVisible()

    const leadCards = page.getByTestId('lead-card')
    await expect(leadCards.first()).toBeVisible({ timeout: 15000 })

    const firstLead = leadCards.first()
    await firstLead.getByTestId('lead-quote').click()

    await expect(page.getByTestId('quote-save')).toBeVisible()
    await page.getByTestId('quote-save').click()

    await expect(page.getByTestId('quote-save-message')).toContainText('Quote saved', { timeout: 15000 })
    await expect(page.getByTestId('quote-copy-link')).toBeEnabled()
  })
})
