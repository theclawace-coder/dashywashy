import { test, expect } from '@playwright/test'
import { loginAsSeedUser, waitForAppReady } from './helpers/auth'

test.describe('Manual smoke - Dashboard shell', () => {
  test('opens key global controls and overlays', async ({ page }) => {
    await loginAsSeedUser(page)
    await page.goto('/')
    await waitForAppReady(page)

    await expect(page.getByRole('heading', { name: /Today's Progress/i })).toBeVisible()

    // User menu
    await page.click('[data-tour="user-menu"]')
    await expect(page.getByRole('button', { name: /Sign out/i })).toBeVisible()
    await page.keyboard.press('Escape')

    // Command palette via nav button
    const commandPaletteButton = page.getByTestId('nav-command-palette')
    if (await commandPaletteButton.isVisible()) {
      await commandPaletteButton.click()
      await expect(page.getByPlaceholder('Type a command or search...')).toBeVisible()
      await page.keyboard.press('Escape')
    }

    // Global search via event
    await page.evaluate(() => window.dispatchEvent(new Event('open-global-search')))
    await expect(page.getByPlaceholder(/Search leads, bookings, cleaners/i)).toBeVisible()
    await page.keyboard.press('Escape')

    // Manual todo popup
    const todoButton = page.locator('button[title="Open manual todos"]')
    await todoButton.click()
    await expect(page.getByText('Manual Todos')).toBeVisible()
    await page.keyboard.press('Escape')
  })
})
