import { expect, type Page } from '@playwright/test'
import {
  ensureSeedOrgMembership,
  ensureTestUser,
  ensureTestUserWithOrg,
  setTourCompleted,
  TEST_USER_EMAIL,
  TEST_USER_PASSWORD,
} from './supabaseAdmin'

export async function loginAsTestUser(page: Page) {
  const { user } = await ensureTestUserWithOrg()
  await setTourCompleted(user.id, true)

  await page.goto('/auth/login')
  await page.fill('input[placeholder="you@company.com"]', TEST_USER_EMAIL)
  await page.fill('input[placeholder="Enter your password"]', TEST_USER_PASSWORD)
  const [authResponse] = await Promise.all([
    page.waitForResponse((resp) => resp.url().includes('/auth/v1/token') && resp.request().method() === 'POST'),
    page.click('button:has-text("Sign in")'),
  ])

  if (!authResponse.ok()) {
    const body = await authResponse.text().catch(() => '')
    throw new Error(`Login failed: ${authResponse.status()} ${body}`)
  }
  await page.waitForURL(/\/$/)
  await page.waitForFunction(() => {
    return Object.keys(window.localStorage).some((key) => key.includes('auth-token'))
  })
  await waitForAppReady(page)
}

export async function loginAsSeedUser(page: Page) {
  const user = await ensureTestUser()
  await ensureSeedOrgMembership(user.id)
  await setTourCompleted(user.id, true)

  await page.goto('/auth/login')
  await page.fill('input[placeholder="you@company.com"]', TEST_USER_EMAIL)
  await page.fill('input[placeholder="Enter your password"]', TEST_USER_PASSWORD)
  const [authResponse] = await Promise.all([
    page.waitForResponse((resp) => resp.url().includes('/auth/v1/token') && resp.request().method() === 'POST'),
    page.click('button:has-text("Sign in")'),
  ])

  if (!authResponse.ok()) {
    const body = await authResponse.text().catch(() => '')
    throw new Error(`Login failed: ${authResponse.status()} ${body}`)
  }
  await page.waitForURL(/\/$/)
  await page.waitForFunction(() => {
    return Object.keys(window.localStorage).some((key) => key.includes('auth-token'))
  })
  await waitForAppReady(page)
}

export async function waitForAppReady(page: Page) {
  await expect(page.locator('header.nav-main')).toBeVisible({ timeout: 20000 })
  await dismissTourIfPresent(page)
}

async function dismissTourIfPresent(page: Page) {
  const popover = page.locator('.tour-popover')
  try {
    await popover.first().waitFor({ state: 'visible', timeout: 2000 })
  } catch {
    return
  }

  const skipButton = page.locator('.tour-popover .tour-skip-btn')
  if (await skipButton.count()) {
    await skipButton.first().click()
    return
  }

  const closeButton = page.locator('.tour-popover .driver-close-btn')
  if (await closeButton.count()) {
    await closeButton.first().click()
    return
  }

  await page.keyboard.press('Escape')
}
