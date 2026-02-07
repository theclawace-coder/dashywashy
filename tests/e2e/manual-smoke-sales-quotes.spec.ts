import { test, expect } from '@playwright/test'
import { loginAsSeedUser, waitForAppReady } from './helpers/auth'

test.describe('Manual smoke - Sales funnel & Quotes', () => {
  test('exercises filters and basic interactions', async ({ page }) => {
    await loginAsSeedUser(page)

    // Sales funnel
    await page.goto('/salesfunnel')
    await waitForAppReady(page)
    await expect(page.getByRole('heading', { name: 'Sales Pipeline' })).toBeVisible()

    const searchInput = page.getByPlaceholder('Search...')
    await searchInput.fill('zzzz-no-leads')
    await expect(page.getByText('No leads').first()).toBeVisible()
    await searchInput.fill('')

    const cards = page.locator('[draggable="true"]')
    if (await cards.count()) {
      const firstCard = cards.first()
      await firstCard.click()
      const cardButtons = await firstCard.locator('button').count()
      expect(cardButtons).toBeGreaterThan(0)
    }

    // Quotes sent
    await page.goto('/quotes-sent')
    await waitForAppReady(page)
    await expect(page.getByRole('heading', { name: 'Quotes Sent' })).toBeVisible()

    const selects = page.locator('select')
    await selects.first().selectOption('Custom')
    await expect(page.locator('input[type="date"]')).toHaveCount(2)

    const quoteSearch = page.getByPlaceholder('Search quotes...')
    await quoteSearch.fill('zzzz-no-quotes')
    await expect(page.getByText('No quotes found')).toBeVisible()
  })
})
