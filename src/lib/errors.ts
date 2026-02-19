export function getErrorMessage(err: unknown, fallback: string) {
  if (!err) return fallback

  if (err instanceof Error && err.message) {
    return err.message
  }

  if (typeof err === 'string') {
    return err
  }

  if (typeof err === 'object') {
    const anyErr = err as { message?: string; error?: string; details?: string; hint?: string; code?: string }
    if (anyErr.message) return anyErr.message
    if (anyErr.error) return anyErr.error
    const parts = [anyErr.code, anyErr.details, anyErr.hint].filter(Boolean)
    if (parts.length) return parts.join(' ')
  }

  try {
    return JSON.stringify(err)
  } catch {
    return fallback
  }
}
