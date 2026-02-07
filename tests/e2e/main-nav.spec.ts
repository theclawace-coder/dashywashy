import { test, expect } from '@playwright/test'
import { loginAsTestUser, waitForAppReady } from './helpers/auth'

const NAV_ITEMS = [
  { id: 'dashboard', heading: /Today's Progress/i },
  { id: 'funnel', heading: 'Sales Pipeline' },
  { id: 'calendar', heading: 'Booking Calendar' },
  { id: 'dispatch', heading: 'Dispatch' },
  { id: 'quotes', heading: 'Quotes Sent' },
  { id: 'completed', heading: 'Completed Jobs' },
  { id: 'payout', heading: 'Cleaners Payout' },
  { id: 'analytics', heading: 'Business Analytics' },
  { id: 'todo', heading: /Daily Checklist/i },
  { id: 'cleaners', heading: 'Team Management' },
  { id: 'repeat', heading: 'Repeat Customers' },
  { id: 'marketing', heading: 'Marketing Loop' },
  { id: 'settings', heading: 'Organization Settings' },
]

test.describe('Main navigation smoke', () => {
  test('navigates primary pages from the main menu', async ({ page }) => {
    await loginAsTestUser(page)
    await page.goto('/')
    await waitForAppReady(page)

    await expect(page.getByTestId('main-nav')).toBeVisible()

    for (const item of NAV_ITEMS) {
      const navLink = page.getByTestId(`nav-link-${item.id}`)
      await navLink.scrollIntoViewIfNeeded()
      await navLink.click()
      await expect(page.getByRole('heading', { name: item.heading })).toBeVisible()
    }
  })
})
