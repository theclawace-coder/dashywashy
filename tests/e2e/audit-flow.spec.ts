import { test, expect } from '@playwright/test'
import { ensureUser, findAnyQuoteShareToken } from './helpers/supabaseAdmin'
import { waitForAppReady } from './helpers/auth'

const hasServiceKey = Boolean(
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
)

test.setTimeout(240000)

test.describe('Full audit flow', () => {
  test('signup -> onboarding -> core routes -> public quote', async ({ page }) => {
    if (!hasServiceKey) {
      throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY for audit flow.')
    }

    const testId = Date.now()
    const user = {
      fullName: `Audit User ${testId}`,
      email: `audit${testId}@example.com`,
      password: 'TestPassword123!',
      businessName: `Audit Cleaning ${testId}`,
    }

    await page.goto('/auth/signup')
    await page.fill('input[placeholder="Jane Smith"]', user.fullName)
    await page.fill('input[placeholder="Acme Cleaning Co."]', user.businessName)
    await page.fill('input[placeholder="you@company.com"]', user.email)
    await page.fill('input[placeholder="Min. 8 characters"]', user.password)
    await page.fill('input[placeholder="Repeat your password"]', user.password)
    await page.click('button:has-text("Create account")')

    let onOnboarding = false
    try {
      await page.waitForURL(/\/onboarding/, { timeout: 15000 })
      onOnboarding = true
    } catch {
      const errorText = await page.locator('.text-red-400').textContent().catch(() => '')
      if (errorText && /rate limit|invalid|already registered|already exists/i.test(errorText)) {
        await ensureUser(user.email, user.password, user.fullName)
        await page.goto('/auth/login')
        await page.fill('input[placeholder="you@company.com"]', user.email)
        await page.fill('input[placeholder="Enter your password"]', user.password)
        await page.click('button:has-text("Sign in")')
        await page.waitForURL(/\/$/)
        await page.goto('/onboarding')
        onOnboarding = true
      } else {
        throw new Error(`Signup failed: ${errorText || 'unknown error'}`)
      }
    }

    if (!onOnboarding) {
      throw new Error('Failed to reach onboarding flow')
    }

    // Step 0: Business details (required)
    await page.fill('input[placeholder="Acme Cleaning Co."]', user.businessName)
    await page.getByRole('button', { name: 'Next' }).click({ force: true })
    await expect(
      page.getByRole('heading', { name: /Branding & locale/i })
    ).toBeVisible({ timeout: 15000 })

    // Step 1: Branding (optional)
    await page.getByRole('button', { name: 'Skip' }).click({ force: true })
    await expect(
      page.getByRole('heading', { name: /pricing defaults/i })
    ).toBeVisible({ timeout: 15000 })

    // Step 2: Pricing defaults
    await page.getByRole('button', { name: 'Next' }).click({ force: true })
    await expect(
      page.getByRole('heading', { name: /connect your tools/i })
    ).toBeVisible({ timeout: 15000 })

    // Step 3: Integrations (optional)
    await page.getByRole('button', { name: 'Skip' }).click({ force: true })
    await expect(page.getByRole('heading', { name: /invite your team/i })).toBeVisible({
      timeout: 15000,
    })

    // Step 4: Invites
    await page.getByRole('button', { name: /Go to Dashboard/i }).click({ force: true })

    await page.waitForURL(/\/$/)
    await waitForAppReady(page)
    await expect(page.getByRole('heading', { name: "Today's Progress" })).toBeVisible({
      timeout: 15000,
    })

    await page.reload()
    await waitForAppReady(page)
    await expect(page.getByRole('heading', { name: "Today's Progress" })).toBeVisible({
      timeout: 15000,
    })

    // Core routes smoke audit
    const checks: Array<{ path: string; heading: string | RegExp; exact?: boolean }> = [
      { path: '/salesfunnel', heading: 'Sales Pipeline' },
      { path: '/quotes-sent', heading: 'Quotes Sent' },
      { path: '/calendar', heading: 'Booking Calendar' },
      { path: '/dispatch', heading: 'Dispatch' },
      { path: '/cleaners', heading: 'Team Management' },
      { path: '/completed', heading: 'Completed Jobs' },
      { path: '/cleaners-payout', heading: 'Cleaners Payout' },
      { path: '/repeat-customers', heading: 'Repeat Customers' },
      { path: '/todo', heading: /Daily Checklist/i },
      { path: '/marketing-loop', heading: 'Marketing Loop' },
      { path: '/analytics', heading: 'Business Analytics' },
      { path: '/settings', heading: 'Organization Settings' },
      { path: '/settings/team', heading: 'Team', exact: true },
      { path: '/settings/integrations', heading: 'Integrations' },
      { path: '/settings/billing', heading: 'Billing & Plan' },
    ]

    for (const check of checks) {
      await page.goto(check.path)
      await waitForAppReady(page)
      const headingLocator =
        check.heading instanceof RegExp
          ? page.getByRole('heading', { name: check.heading })
          : page.getByRole('heading', { name: check.heading, exact: check.exact ?? true })

      await expect(headingLocator).toBeVisible({ timeout: 15000 })
    }

    // Public quote flow (existing share token if available)
    const shareToken = await findAnyQuoteShareToken()
    if (shareToken) {
      await page.goto(`/quote?quote=${shareToken}`)
      await expect(page.getByRole('heading', { name: /Cleaning Quote/ })).toBeVisible()
    } else {
      test.info().annotations.push({
        type: 'note',
        description: 'No quotes with share_token found; skipped public quote check.',
      })
    }
  })
})
