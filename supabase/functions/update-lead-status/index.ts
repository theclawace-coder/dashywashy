import { resolveOrgFromRequest, corsHeaders, jsonResponse, jsonError } from '../_shared/org-resolver.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonError('Method not allowed', 405)
  }

  try {
  const { orgId, supabaseAdmin } = await resolveOrgFromRequest(req)
  const supabase = supabaseAdmin

  let payload: { leadId?: string; status?: string | null }
  try {
    payload = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const leadId = payload?.leadId
  const statusInput = payload?.status

  if (!leadId) {
    return jsonResponse({ error: 'leadId is required' }, 400)
  }

  if (statusInput === undefined) {
    return jsonResponse({ error: 'status is required' }, 400)
  }

  const normalizedStatus = statusInput === null || statusInput === '' ? null : String(statusInput).trim()
  if (normalizedStatus === '') {
    return jsonResponse({ error: 'status cannot be empty' }, 400)
  }

  try {
    // Get current status before updating
    const { data: currentLead } = await supabase
      .from('extracted_leads')
      .select('id, status')
      .eq('id', leadId)
      .eq('org_id', orgId)
      .maybeSingle()

    if (!currentLead) {
      return jsonResponse({ error: 'Lead not found' }, 404)
    }

    const previousStatus = currentLead.status || null
    const previousStatusNormalized = previousStatus ? String(previousStatus).trim() : null

    // Update status
    const { data, error } = await supabase
      .from('extracted_leads')
      .update({ status: normalizedStatus })
      .eq('id', leadId)
      .eq('org_id', orgId)
      .select('id, status')
      .maybeSingle()

    if (error) {
      return jsonResponse({ error: error.message || 'Failed to update status' }, 500)
    }

    if (!data) {
      return jsonResponse({ error: 'Lead not found' }, 404)
    }

    // Handle Marketing Loop journey start/stop
    const supabaseUrlEnv = Deno.env.get('SUPABASE_URL') || ''
    const actionsUrl = `${supabaseUrlEnv}/functions/v1/marketing-loop-actions`

    const authHeader = req.headers.get('Authorization') || ''
    const actionAuthKey = authHeader.replace('Bearer ', '') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

    // If moving TO Marketing Loop, start journeys
    if (normalizedStatus === 'Marketing Loop' && previousStatusNormalized !== 'Marketing Loop') {
      try {
        const journeyResponse = await fetch(actionsUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: actionAuthKey,
            Authorization: `Bearer ${actionAuthKey}`,
          },
          body: JSON.stringify({
            action: 'start',
            leadId,
            journeyType: 'both',
          }),
        })
        
        if (!journeyResponse.ok) {
          const journeyError = await journeyResponse.text().catch(() => 'Unknown error')
          console.error('Failed to start marketing loop journeys:', journeyError)
        }
        // Don't fail the status update if journey start fails
      } catch (journeyErr) {
        console.error('Failed to start marketing loop journeys:', journeyErr)
      }
    }

    // If moving AWAY FROM Marketing Loop, cancel journeys
    if (previousStatusNormalized === 'Marketing Loop' && normalizedStatus !== 'Marketing Loop') {
      try {
        const journeyResponse = await fetch(actionsUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: actionAuthKey,
            Authorization: `Bearer ${actionAuthKey}`,
          },
          body: JSON.stringify({
            action: 'cancel',
            leadId,
            journeyType: 'both',
          }),
        })
        
        if (!journeyResponse.ok) {
          const journeyError = await journeyResponse.text().catch(() => 'Unknown error')
          console.error('Failed to cancel marketing loop journeys:', journeyError)
        }
        // Don't fail the status update if journey cancel fails
      } catch (journeyErr) {
        console.error('Failed to cancel marketing loop journeys:', journeyErr)
      }
    }

    return jsonResponse({ success: true, leadId: data.id, status: data.status })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    return jsonError(message, 500)
  }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    const status = message === 'Unauthorized' ? 401 : 500
    return jsonError(message, status)
  }
})

