import { test, expect } from '@playwright/test'
import { loginAsTestUser, waitForAppReady } from './helpers/auth'

test.describe('Public routes', () => {
  test('shows payment success status', async ({ page }) => {
    await page.goto('/payment-success')
    await expect(page.getByRole('heading', { name: 'Payment successful' })).toBeVisible()
  })

  test('shows payment cancelled status', async ({ page }) => {
    await page.goto('/payment-cancel')
    await expect(page.getByRole('heading', { name: 'Payment cancelled' })).toBeVisible()
  })
})

test.describe('Authenticated routes', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page)
  })

  test('loads the dashboard', async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await expect(page.getByRole('heading', { name: "Today's Progress" })).toBeVisible()
  })

  test('loads sales funnel', async ({ page }) => {
    await page.goto('/salesfunnel')
    await waitForAppReady(page)
    await expect(page.getByRole('heading', { name: 'Sales Pipeline' })).toBeVisible()
  })

  test('loads quotes sent', async ({ page }) => {
    await page.goto('/quotes-sent')
    await waitForAppReady(page)
    await expect(page.getByRole('heading', { name: 'Quotes Sent' })).toBeVisible()
  })

  test('loads booking calendar', async ({ page }) => {
    await page.goto('/calendar')
    await waitForAppReady(page)
    await expect(page.getByRole('heading', { name: 'Booking Calendar' })).toBeVisible()
  })

  test('loads dispatch', async ({ page }) => {
    await page.goto('/dispatch')
    await waitForAppReady(page)
    await expect(page.getByRole('heading', { name: 'Dispatch' })).toBeVisible()
  })

  test('loads cleaners', async ({ page }) => {
    await page.goto('/cleaners')
    await waitForAppReady(page)
    await expect(page.getByRole('heading', { name: 'Team Management' })).toBeVisible()
  })

  test('loads completed jobs', async ({ page }) => {
    await page.goto('/completed')
    await waitForAppReady(page)
    await expect(page.getByRole('heading', { name: 'Completed Jobs' })).toBeVisible()
  })

  test('loads cleaners payout', async ({ page }) => {
    await page.goto('/cleaners-payout')
    await waitForAppReady(page)
    await expect(page.getByRole('heading', { name: 'Cleaners Payout' })).toBeVisible()
  })

  test('loads repeat customers', async ({ page }) => {
    await page.goto('/repeat-customers')
    await waitForAppReady(page)
    await expect(page.getByRole('heading', { name: 'Repeat Customers' })).toBeVisible()
  })

  test('loads end of day checklist', async ({ page }) => {
    await page.goto('/todo')
    await waitForAppReady(page)
    await expect(page.getByRole('heading', { name: 'Daily Checklist' })).toBeVisible()
  })
})
