import { test, expect } from '@playwright/test'
import { loginAsSeedUser, waitForAppReady } from './helpers/auth'

test.describe('Manual smoke - Calendar, Dispatch, Cleaners', () => {
  test('exercises core inputs and validation', async ({ page }) => {
    await loginAsSeedUser(page)

    // Calendar
    await page.goto('/calendar')
    await waitForAppReady(page)
    await expect(page.getByRole('heading', { name: 'Booking Calendar' })).toBeVisible()
    const todayButton = page.locator('button.fc-today-button')
    if (await todayButton.count()) {
      const button = todayButton.first()
      if (await button.isEnabled()) {
        await button.click()
      }
    }

    // Dispatch
    await page.goto('/dispatch')
    await waitForAppReady(page)
    await expect(page.getByRole('heading', { name: 'Dispatch' })).toBeVisible()
    const bulkSearch = page.getByPlaceholder('Search cleaners by name or phone')
    await bulkSearch.fill('morgan')
    await expect(bulkSearch).toHaveValue('morgan')
    await expect(page.getByPlaceholder('Type message to send...')).toBeVisible()

    // Cleaners
    await page.goto('/cleaners')
    await waitForAppReady(page)
    await expect(page.getByRole('heading', { name: 'Team Management' })).toBeVisible()
    await page.getByRole('button', { name: /Add Cleaner|Save Changes/ }).click()
    await expect(page.getByText('Name required')).toBeVisible()
  })
})
