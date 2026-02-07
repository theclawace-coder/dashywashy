import { test, expect } from '@playwright/test'
import { ensureTestUser, TEST_USER_EMAIL, TEST_USER_PASSWORD } from './helpers/supabaseAdmin'

test.describe('Login flow', () => {
  test('shows login screen by default', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
    await expect(page.getByPlaceholder('you@company.com')).toBeVisible()
    await expect(page.getByPlaceholder('Enter your password')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  })

  test('rejects invalid credentials', async ({ page }) => {
    await page.goto('/')

    await page.getByPlaceholder('you@company.com').fill('baduser@example.com')
    await page.getByPlaceholder('Enter your password').fill('badpass')
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page.getByText('Invalid login credentials')).toBeVisible()
  })

  test('signs in with valid credentials', async ({ page }) => {
    await ensureTestUser()
    await page.goto('/')

    await page.getByPlaceholder('you@company.com').fill(TEST_USER_EMAIL)
    await page.getByPlaceholder('Enter your password').fill(TEST_USER_PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()

    await page.waitForURL(/\/$/)
    await expect(page.getByRole('heading', { name: "Today's Progress" })).toBeVisible()
  })
})
