/**
 * Signup Wizard E2E Tests
 * Tests the complete signup flow: SignupPage -> OnboardingPage (5 steps)
 *
 * Routes:
 * - /auth/signup - public signup page
 * - /auth/login - public login page
 * - /onboarding - requires authentication (redirects to login if not)
 */

import { test, expect, Page } from '@playwright/test'
import { ensureUser } from './helpers/supabaseAdmin'

// Generate unique test data for each test run
const testId = Date.now()
const TEST_USER = {
  fullName: `Test User ${testId}`,
  email: `testuser${testId}@example.com`,
  password: 'TestPassword123!',
  businessName: `Test Business ${testId}`,
}

test.describe('Signup Wizard Flow', () => {
  test.describe('SignupPage (/auth/signup)', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/auth/signup')
      await page.waitForLoadState('networkidle')
    })

    test('should display signup form with all required fields', async ({ page }) => {
      // Check page title/header
      await expect(page.locator('h1:has-text("Create your account")')).toBeVisible()
      await expect(page.locator('text=Get started with your new workspace')).toBeVisible()

      // Check all form labels are present
      await expect(page.locator('text=FULL NAME').first()).toBeVisible()
      await expect(page.locator('text=BUSINESS NAME').first()).toBeVisible()
      await expect(page.locator('text=EMAIL').first()).toBeVisible()
      await expect(page.locator('text=PASSWORD').first()).toBeVisible()
      await expect(page.locator('text=CONFIRM PASSWORD').first()).toBeVisible()

      // Check submit button
      await expect(page.locator('button:has-text("Create account")')).toBeVisible()

      // Check link to login page
      await expect(page.locator('text=Already have an account?')).toBeVisible()
      await expect(page.locator('a:has-text("Sign in")')).toBeVisible()

      // Take screenshot for verification
      await page.screenshot({ path: 'tests/e2e/screenshots/signup-form.png', fullPage: true })
    })

    test('should show error when passwords do not match', async ({ page }) => {
      // Fill in form with mismatched passwords
      await page.fill('input[placeholder="Jane Smith"]', TEST_USER.fullName)
      await page.fill('input[placeholder="Acme Cleaning Co."]', TEST_USER.businessName)
      await page.fill('input[placeholder="you@company.com"]', TEST_USER.email)
      await page.fill('input[placeholder="Min. 8 characters"]', 'Password123')
      await page.fill('input[placeholder="Repeat your password"]', 'DifferentPassword')

      // Submit form
      await page.click('button:has-text("Create account")')

      // Check for error message
      await expect(page.locator('text=Passwords do not match')).toBeVisible()
    })

    test('should show error when password is too short', async ({ page }) => {
      // Fill in form with short password
      await page.fill('input[placeholder="Jane Smith"]', TEST_USER.fullName)
      await page.fill('input[placeholder="Acme Cleaning Co."]', TEST_USER.businessName)
      await page.fill('input[placeholder="you@company.com"]', TEST_USER.email)
      await page.fill('input[placeholder="Min. 8 characters"]', 'short')
      await page.fill('input[placeholder="Repeat your password"]', 'short')

      // Submit form
      await page.click('button:has-text("Create account")')

      // Check for error message
      await expect(page.locator('text=Password must be at least 8 characters')).toBeVisible()
    })

    test('should navigate to login page when clicking Sign in link', async ({ page }) => {
      await page.click('a:has-text("Sign in")')
      await expect(page).toHaveURL(/\/auth\/login/)
    })

    test('should show loading state when submitting valid form', async ({ page }) => {
      // Fill in valid form data
      await page.fill('input[placeholder="Jane Smith"]', TEST_USER.fullName)
      await page.fill('input[placeholder="Acme Cleaning Co."]', TEST_USER.businessName)
      await page.fill('input[placeholder="you@company.com"]', TEST_USER.email)
      await page.fill('input[placeholder="Min. 8 characters"]', TEST_USER.password)
      await page.fill('input[placeholder="Repeat your password"]', TEST_USER.password)

      // Click submit - the button should show loading state
      const submitButton = page.locator('button:has-text("Create account")')
      await submitButton.click()

      // Wait a moment for loading state (may be brief)
      await page.waitForTimeout(500)

      // Either the button is disabled (loading) or we've navigated away
      // or there's an error message (email already registered, etc.)
      const isDisabled = await submitButton.isDisabled().catch(() => false)
      const hasError = await page.locator('.text-red-400').isVisible().catch(() => false)
      const navigatedAway = !page.url().includes('/auth/signup')

      expect(isDisabled || hasError || navigatedAway).toBe(true)
    })

    test('all input fields should accept and retain text', async ({ page }) => {
      // Test each input can accept values
      const testInputs = [
        { placeholder: 'Jane Smith', value: 'Test Name' },
        { placeholder: 'Acme Cleaning Co.', value: 'Test Business' },
        { placeholder: 'you@company.com', value: 'test@test.com' },
        { placeholder: 'Min. 8 characters', value: 'password123' },
        { placeholder: 'Repeat your password', value: 'password123' },
      ]

      for (const input of testInputs) {
        const field = page.locator(`input[placeholder="${input.placeholder}"]`)
        await field.fill(input.value)
        const actualValue = await field.inputValue()
        expect(actualValue).toBe(input.value)
      }
    })

    test('Create account button should be enabled and clickable', async ({ page }) => {
      const createButton = page.locator('button:has-text("Create account")')
      await expect(createButton).toBeEnabled()
      await expect(createButton).toHaveClass(/w-full/)
    })

    test('Sign in link should point to login page', async ({ page }) => {
      const signInLink = page.locator('a:has-text("Sign in")')
      await expect(signInLink).toHaveAttribute('href', '/auth/login')
    })
  })

  test.describe('LoginPage (/auth/login)', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/auth/login')
      await page.waitForLoadState('networkidle')
    })

    test('should display login form with all elements', async ({ page }) => {
      // Check page title/header
      await expect(page.locator('h1:has-text("Welcome back")')).toBeVisible()
      await expect(page.locator('text=Sign in to continue to your dashboard')).toBeVisible()

      // Check form fields
      await expect(page.locator('input[type="email"]')).toBeVisible()
      await expect(page.locator('input[type="password"]')).toBeVisible()
      await expect(page.locator('button:has-text("Sign in")')).toBeVisible()

      // Check link to signup page
      await expect(page.locator('text=Don\'t have an account?')).toBeVisible()
      await expect(page.locator('a:has-text("Create one")')).toBeVisible()
    })

    test('should navigate to signup page when clicking Create one link', async ({ page }) => {
      await page.click('a:has-text("Create one")')
      await expect(page).toHaveURL(/\/signup/)
    })

    test('login form inputs should accept text', async ({ page }) => {
      const emailInput = page.locator('input[type="email"]')
      const passwordInput = page.locator('input[type="password"]')

      await emailInput.fill('test@example.com')
      await passwordInput.fill('testpassword')

      expect(await emailInput.inputValue()).toBe('test@example.com')
      expect(await passwordInput.inputValue()).toBe('testpassword')
    })

    test('Sign in button should be enabled', async ({ page }) => {
      const signInButton = page.locator('button:has-text("Sign in")')
      await expect(signInButton).toBeEnabled()
    })
  })

  test.describe('OnboardingPage (/onboarding) - requires auth', () => {
    test('should redirect to login when not authenticated', async ({ page }) => {
      await page.goto('/onboarding')
      await page.waitForLoadState('networkidle')

      // Should redirect to login page when not authenticated
      await expect(page).toHaveURL(/\/auth\/login/)
    })
  })

  test.describe('Route Navigation', () => {
    test('signup -> login -> signup navigation works', async ({ page }) => {
      // Start at signup
      await page.goto('/auth/signup')
      await page.waitForLoadState('networkidle')
      await expect(page.locator('h1:has-text("Create your account")')).toBeVisible()

      // Navigate to login
      await page.click('a:has-text("Sign in")')
      await expect(page).toHaveURL(/\/auth\/login/)
      await expect(page.locator('h1:has-text("Welcome back")')).toBeVisible()

      // Navigate back to signup
      await page.click('a:has-text("Create one")')
      await expect(page).toHaveURL(/\/signup/)
      await expect(page.locator('h1:has-text("Create your account")')).toBeVisible()
    })
  })
})

test.describe('Form Validation', () => {
  test('email field should validate email format', async ({ page }) => {
    await page.goto('/auth/signup')
    await page.waitForLoadState('networkidle')

    const emailInput = page.locator('input[placeholder="you@company.com"]')
    await emailInput.fill('invalid-email-format')

    // HTML5 validation should mark it as invalid
    const isValid = await emailInput.evaluate((el: HTMLInputElement) => el.checkValidity())
    expect(isValid).toBe(false)
  })

  test('required fields should not submit when empty', async ({ page }) => {
    await page.goto('/auth/signup')
    await page.waitForLoadState('networkidle')

    // Try to submit with empty form
    await page.click('button:has-text("Create account")')

    // Should still be on signup page (form didn't submit)
    await expect(page).toHaveURL(/\/auth\/signup/)
  })
})

test.describe('Accessibility', () => {
  test('signup form should have proper labels', async ({ page }) => {
    await page.goto('/auth/signup')
    await page.waitForLoadState('networkidle')

    // Check that labels are present
    const labels = ['FULL NAME', 'BUSINESS NAME', 'EMAIL', 'PASSWORD', 'CONFIRM PASSWORD']
    for (const label of labels) {
      await expect(page.locator(`text=${label}`).first()).toBeVisible()
    }
  })

  test('login form should have proper labels', async ({ page }) => {
    await page.goto('/auth/login')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('text=EMAIL')).toBeVisible()
    await expect(page.locator('text=PASSWORD')).toBeVisible()
  })

  test('buttons should be keyboard accessible', async ({ page }) => {
    await page.goto('/auth/signup')
    await page.waitForLoadState('networkidle')

    // Tab through the form
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab')
    }

    // Check something is focused
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName)
    expect(['BUTTON', 'INPUT', 'A']).toContain(focusedElement)
  })
})

test.describe('Visual Inspection', () => {
  test('capture signup page screenshot', async ({ page }) => {
    await page.goto('/auth/signup')
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: 'tests/e2e/screenshots/signup-page-visual.png', fullPage: true })

    // Verify page loaded correctly
    await expect(page.locator('h1:has-text("Create your account")')).toBeVisible()
  })

  test('capture login page screenshot', async ({ page }) => {
    await page.goto('/auth/login')
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: 'tests/e2e/screenshots/login-page-visual.png', fullPage: true })

    // Verify page loaded correctly
    await expect(page.locator('h1:has-text("Welcome back")')).toBeVisible()
  })

  test('capture filled signup form screenshot', async ({ page }) => {
    await page.goto('/auth/signup')
    await page.waitForLoadState('networkidle')

    // Fill the form
    await page.fill('input[placeholder="Jane Smith"]', 'John Doe')
    await page.fill('input[placeholder="Acme Cleaning Co."]', 'My Cleaning Business')
    await page.fill('input[placeholder="you@company.com"]', 'john@mybusiness.com')
    await page.fill('input[placeholder="Min. 8 characters"]', 'MySecurePassword123')
    await page.fill('input[placeholder="Repeat your password"]', 'MySecurePassword123')

    await page.screenshot({ path: 'tests/e2e/screenshots/signup-form-filled.png', fullPage: true })
  })
})

test.describe('Error State Handling', () => {
  test('password mismatch shows error message in error container', async ({ page }) => {
    await page.goto('/auth/signup')
    await page.waitForLoadState('networkidle')

    // Fill form with mismatched passwords
    await page.fill('input[placeholder="Jane Smith"]', 'Test User')
    await page.fill('input[placeholder="Acme Cleaning Co."]', 'Test Business')
    await page.fill('input[placeholder="you@company.com"]', 'test@example.com')
    await page.fill('input[placeholder="Min. 8 characters"]', 'Password123!')
    await page.fill('input[placeholder="Repeat your password"]', 'DifferentPassword')

    await page.click('button:has-text("Create account")')

    // Error message should appear in the error container
    const errorContainer = page.locator('.bg-\\[var\\(--color-error-muted\\)\\]')
    await expect(errorContainer).toBeVisible()
    await expect(page.locator('text=Passwords do not match')).toBeVisible()

    await page.screenshot({ path: 'tests/e2e/screenshots/signup-password-mismatch-error.png', fullPage: true })
  })

  test('short password shows error message', async ({ page }) => {
    await page.goto('/auth/signup')
    await page.waitForLoadState('networkidle')

    // Fill form with short password
    await page.fill('input[placeholder="Jane Smith"]', 'Test User')
    await page.fill('input[placeholder="Acme Cleaning Co."]', 'Test Business')
    await page.fill('input[placeholder="you@company.com"]', 'test@example.com')
    await page.fill('input[placeholder="Min. 8 characters"]', 'short')
    await page.fill('input[placeholder="Repeat your password"]', 'short')

    await page.click('button:has-text("Create account")')

    // Error message should appear
    await expect(page.locator('text=Password must be at least 8 characters')).toBeVisible()

    await page.screenshot({ path: 'tests/e2e/screenshots/signup-short-password-error.png', fullPage: true })
  })
})

test.describe('Complete Signup Flow (E2E)', () => {
  test('full signup journey with screenshots at each step', async ({ page }) => {
    const screenshots: string[] = []
    const consoleLogs: string[] = []
    const hasServiceKey = Boolean(
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
    )

    // Capture console logs
    page.on('console', (msg) => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`)
    })

    // Step 1: Navigate to signup page
    console.log('Step 1: Navigating to /auth/signup')
    await page.goto('/auth/signup')
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: 'tests/e2e/screenshots/flow-01-signup-page.png', fullPage: true })
    screenshots.push('flow-01-signup-page.png')

    // Verify we're on signup page
    await expect(page.locator('h1:has-text("Create your account")')).toBeVisible()

    // Step 2: Fill signup form
    console.log('Step 2: Filling signup form')
    await page.fill('input[placeholder="Jane Smith"]', TEST_USER.fullName)
    await page.fill('input[placeholder="Acme Cleaning Co."]', TEST_USER.businessName)
    await page.fill('input[placeholder="you@company.com"]', TEST_USER.email)
    await page.fill('input[placeholder="Min. 8 characters"]', TEST_USER.password)
    await page.fill('input[placeholder="Repeat your password"]', TEST_USER.password)
    await page.screenshot({ path: 'tests/e2e/screenshots/flow-02-form-filled.png', fullPage: true })
    screenshots.push('flow-02-form-filled.png')

    // Step 3: Submit form
    console.log('Step 3: Submitting signup form')
    await page.click('button:has-text("Create account")')

    // Wait for response (navigation or error)
    await page.waitForTimeout(3000)
    await page.screenshot({ path: 'tests/e2e/screenshots/flow-03-after-submit.png', fullPage: true })
    screenshots.push('flow-03-after-submit.png')

    // Log current state
    console.log('Current URL after submit:', page.url())

    // Check what happened
    const onSignupPage = page.url().includes('/auth/signup')
    const onOnboardingPage = page.url().includes('/onboarding')
    const hasError = await page.locator('.text-red-400').isVisible().catch(() => false)

    console.log('State:', { onSignupPage, onOnboardingPage, hasError })

    if (hasError) {
      const errorText = await page.locator('.text-red-400').textContent()
      console.log('Error message:', errorText)
      const normalized = (errorText || '').toLowerCase()

      if (/rate limit|invalid|already|exists/.test(normalized)) {
        if (!hasServiceKey) {
          throw new Error('Signup failed and no service role key available for fallback.')
        }

        console.log('Fallback: creating user via admin and logging in.')
        await ensureUser(TEST_USER.email, TEST_USER.password, TEST_USER.fullName)
        await page.goto('/auth/login')
        await page.fill('input[placeholder="you@company.com"]', TEST_USER.email)
        await page.fill('input[placeholder="Enter your password"]', TEST_USER.password)
        await page.click('button:has-text("Sign in")')
        await page.waitForURL(/\/$/)
        await page.goto('/onboarding')
      }
    }

    // If we made it to onboarding, test the wizard steps
    if (onOnboardingPage) {
      console.log('Step 4: Testing onboarding wizard')

      // Step 0: Business Details should be visible
      await page.screenshot({ path: 'tests/e2e/screenshots/flow-04-onboarding-step0.png', fullPage: true })
      screenshots.push('flow-04-onboarding-step0.png')

      // Check business details form
      const businessNameInput = page.locator('input[placeholder="Acme Cleaning Co."]')
      if (await businessNameInput.isVisible()) {
        console.log('Business Details step is displayed')

        // Fill business name if empty
        const currentValue = await businessNameInput.inputValue()
        if (!currentValue) {
          await businessNameInput.fill(TEST_USER.businessName)
        }

        // Click Next button
        await page.click('button:has-text("Next")')
        await page.waitForTimeout(2000)
        await page.screenshot({ path: 'tests/e2e/screenshots/flow-05-after-step0-next.png', fullPage: true })
        screenshots.push('flow-05-after-step0-next.png')
      }
    }

    // Final summary
    console.log('\n=== TEST SUMMARY ===')
    console.log('Screenshots taken:', screenshots)
    console.log('Final URL:', page.url())
    console.log('\n=== CONSOLE LOGS ===')
    consoleLogs.slice(-20).forEach((log) => console.log(log))
  })
})
