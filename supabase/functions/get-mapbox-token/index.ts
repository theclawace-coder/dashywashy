import { resolveOrgFromRequest, getOrgIntegration, corsHeaders, jsonResponse, jsonError } from '../_shared/org-resolver.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  if (req.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const { orgId, supabaseAdmin } = await resolveOrgFromRequest(req)

    const mapboxConfig = await getOrgIntegration(supabaseAdmin, orgId, 'mapbox')
    const token = mapboxConfig.token || mapboxConfig.api_key || Deno.env.get('MAPBOX_TOKEN') || ''

    if (!token) {
      return jsonResponse({ error: 'Mapbox token is not configured' }, 500)
    }

    return jsonResponse({ token })
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message.includes('not a member'))) {
      return jsonError(error.message, 401)
    }
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})
