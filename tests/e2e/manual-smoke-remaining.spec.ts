import { test, expect } from '@playwright/test'
import { loginAsSeedUser, waitForAppReady } from './helpers/auth'
import { findAnyQuoteShareToken } from './helpers/supabaseAdmin'

test.describe('Manual smoke - Remaining routes', () => {
  test('completed jobs and payouts', async ({ page }) => {
    await loginAsSeedUser(page)

    // Completed jobs
    await page.goto('/completed')
    await waitForAppReady(page)
    await expect(page.getByRole('heading', { name: 'Completed Jobs' })).toBeVisible()

    // Cleaners payout
    await page.goto('/cleaners-payout')
    await waitForAppReady(page)
    await expect(page.getByRole('heading', { name: 'Cleaners Payout' })).toBeVisible()
    const payoutSearch = page.getByPlaceholder('Search cleaner...')
    await payoutSearch.fill('morgan')
    await expect(payoutSearch).toHaveValue('morgan')
  })

  test('repeat customers', async ({ page }) => {
    await loginAsSeedUser(page)
    await page.goto('/repeat-customers')
    await waitForAppReady(page)
    await expect(page.getByRole('heading', { name: 'Repeat Customers' })).toBeVisible()
    const repeatSearch = page.getByPlaceholder('Search customers...')
    await repeatSearch.fill('jessie')
    await expect(repeatSearch).toHaveValue('jessie')
  })

  test('todo page', async ({ page }) => {
    await loginAsSeedUser(page)
    await page.goto('/todo')
    await page.getByRole('heading', { name: /Daily Checklist/i }).waitFor({ timeout: 60000 })
    const titleInput = page.getByPlaceholder('What needs to be done?')
    await titleInput.fill('Test manual todo')
    const addButton = page.getByRole('button', { name: 'Add' })
    await expect(addButton).toBeEnabled()
    await addButton.click()
    await expect(page.getByText('Test manual todo').first()).toBeVisible()
  })

  test('marketing loop and analytics', async ({ page }) => {
    await loginAsSeedUser(page)
    await page.goto('/marketing-loop')
    await waitForAppReady(page)
    await expect(page.getByRole('heading', { name: 'Marketing Loop' })).toBeVisible()

    await page.goto('/analytics')
    await waitForAppReady(page)
    await expect(page.getByRole('heading', { name: 'Business Analytics' })).toBeVisible()
  })

  test('settings core pages', async ({ page }) => {
    await loginAsSeedUser(page)
    await page.goto('/settings')
    await page.getByRole('heading', { name: 'Organization Settings' }).waitFor({ timeout: 20000 })
    await expect(page.getByRole('button', { name: 'Save Changes' })).toBeVisible()

    await page.goto('/settings/team')
    await page.getByRole('heading', { name: 'Team', exact: true }).waitFor({ timeout: 20000 })
    await expect(page.getByPlaceholder('teammate@company.com')).toBeVisible()

    await page.goto('/settings/integrations')
    await page.getByRole('heading', { name: 'Integrations' }).waitFor({ timeout: 20000 })
    await page.getByRole('button', { name: /Stripe/ }).click()
    await expect(page.getByPlaceholder('sk_live_...')).toBeVisible()
  })

  test('settings automation and billing pages', async ({ page }) => {
    await loginAsSeedUser(page)
    await page.goto('/settings/automations')
    await page.getByRole('heading', { name: 'Automation Settings' }).waitFor({ timeout: 20000 })

    await page.goto('/settings/workflows')
    await page.getByRole('heading', { name: 'Workflows', exact: true }).waitFor({ timeout: 20000 })

    await page.goto('/settings/billing')
    const billingHeading = page.getByRole('heading', { name: 'Billing & Plan' })
    const billingDenied = page.getByText('Only the organization owner can manage billing.')
    await expect(billingHeading.or(billingDenied)).toBeVisible({ timeout: 20000 })
  })

  test('completed jobs alias and public quote', async ({ page }) => {
    await loginAsSeedUser(page)
    await page.goto('/completed-jobs')
    await waitForAppReady(page)
    await expect(page.getByRole('heading', { name: 'Completed Jobs' })).toBeVisible()

    const shareToken = await findAnyQuoteShareToken()
    test.skip(!shareToken, 'No quote share token found for public quote view.')
    await page.goto(`/quote?quote=${shareToken}`)
    await expect(page.getByRole('heading', { name: /Cleaning Quote/ })).toBeVisible()
  })
})
