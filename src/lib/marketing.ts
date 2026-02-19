export const MARKETING_PATH_PREFIXES = [
  '/features',
  '/pricing',
  '/integrations',
  '/ai-agent',
  '/inside',
  '/memberships',
  '/faq',
  '/company',
  '/about',
]

export function isMarketingPath(pathname: string) {
  const trimmed = pathname.replace(/\/+$/, '') || '/'
  if (trimmed === '/') return true
  return MARKETING_PATH_PREFIXES.some((prefix) => trimmed.startsWith(prefix))
}
