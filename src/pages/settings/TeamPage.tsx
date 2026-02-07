/**
 * TeamPage - Manage organization members and invitations.
 * List members, change roles, remove members, send invites.
 */

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { GlassCard, Button, Input, Badge, Modal } from '../../components/ui'
import type { OrgRole } from '../../lib/types'

interface Member {
  id: string
  user_id: string
  role: OrgRole
  display_name: string | null
  joined_at: string
  email?: string
}

interface Invite {
  id: string
  email: string
  role: OrgRole
  token: string
  expires_at: string
  accepted_at: string | null
  created_at: string
}

const ROLE_OPTIONS: OrgRole[] = ['owner', 'admin', 'manager', 'staff', 'cleaner']

const ROLE_COLORS: Record<OrgRole, string> = {
  owner: 'warning',
  admin: 'error',
  manager: 'info',
  staff: 'success',
  cleaner: 'success',
}

export default function TeamPage() {
  const { currentOrg, user, hasRole } = useAuth()
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Invite form
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<OrgRole>('staff')
  const [inviteSending, setInviteSending] = useState(false)

  // Remove confirmation
  const [removingMember, setRemovingMember] = useState<Member | null>(null)
  const [removeLoading, setRemoveLoading] = useState(false)

  const fetchData = useCallback(async () => {
    if (!currentOrg) return
    setLoading(true)

    const [membersRes, invitesRes] = await Promise.all([
      supabase
        .from('organization_members')
        .select('*')
        .eq('org_id', currentOrg.id)
        .order('joined_at', { ascending: true }),
      supabase
        .from('organization_invites')
        .select('*')
        .eq('org_id', currentOrg.id)
        .is('accepted_at', null)
        .order('created_at', { ascending: false }),
    ])

    if (membersRes.data) setMembers(membersRes.data)
    if (invitesRes.data) setInvites(invitesRes.data)
    setLoading(false)
  }, [currentOrg])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleSendInvite = async () => {
    if (!inviteEmail.trim() || !currentOrg) return
    setInviteSending(true)
    setError(null)

    const { error: err } = await supabase.functions.invoke('send-invite', {
      body: { email: inviteEmail.trim(), role: inviteRole },
    })

    if (err) {
      setError(err.message)
    } else {
      setInviteEmail('')
      setInviteRole('staff')
      fetchData()
    }
    setInviteSending(false)
  }

  const handleChangeRole = async (memberId: string, newRole: OrgRole) => {
    setError(null)
    const { error: err } = await supabase
      .from('organization_members')
      .update({ role: newRole })
      .eq('id', memberId)
      .eq('org_id', currentOrg!.id)

    if (err) {
      setError(err.message)
    } else {
      fetchData()
    }
  }

  const handleRemoveMember = async () => {
    if (!removingMember || !currentOrg) return
    setRemoveLoading(true)

    const { error: err } = await supabase
      .from('organization_members')
      .delete()
      .eq('id', removingMember.id)
      .eq('org_id', currentOrg.id)

    if (err) {
      setError(err.message)
    } else {
      setRemovingMember(null)
      fetchData()
    }
    setRemoveLoading(false)
  }

  const handleRevokeInvite = async (inviteId: string) => {
    setError(null)
    const { error: err } = await supabase
      .from('organization_invites')
      .delete()
      .eq('id', inviteId)
      .eq('org_id', currentOrg!.id)

    if (err) {
      setError(err.message)
    } else {
      fetchData()
    }
  }

  if (!hasRole('admin')) {
    return (
      <div className="p-8 text-center">
        <p className="text-[var(--color-text-secondary)]">You need admin or owner access to manage team members.</p>
      </div>
    )
  }

  const ownerCount = members.filter((m) => m.role === 'owner').length

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-title text-white">Team</h1>
        <p className="text-caption mt-1">Manage who has access to {currentOrg?.business_name ?? 'your organization'}.</p>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-[var(--color-error-muted)] border border-red-500/20">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Invite */}
      <GlassCard className="p-6">
        <h2 className="text-heading text-white mb-4">Invite a Team Member</h2>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Input
              label="EMAIL"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="teammate@company.com"
            />
          </div>
          <div className="w-32">
            <label className="text-micro block mb-1.5">ROLE</label>
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as OrgRole)} className="input w-full">
              {ROLE_OPTIONS.filter((r) => r !== 'owner').map((r) => (
                <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
              ))}
            </select>
          </div>
          <Button variant="primary" onClick={handleSendInvite} loading={inviteSending}>
            Invite
          </Button>
        </div>
      </GlassCard>

      {/* Current Members */}
      <GlassCard className="p-6">
        <h2 className="text-heading text-white mb-4">Members ({members.length})</h2>
        {loading ? (
          <p className="text-caption">Loading...</p>
        ) : (
          <div className="space-y-3">
            {members.map((member) => {
              const isCurrentUser = member.user_id === user?.id
              const isSoleOwner = member.role === 'owner' && ownerCount <= 1
              return (
                <div key={member.id} className="flex items-center justify-between p-3 rounded-xl bg-[var(--color-surface)] border border-[var(--glass-border)]">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[var(--color-accent-muted)] flex items-center justify-center text-sm font-semibold text-[var(--color-accent)]">
                      {(member.display_name || member.email || 'U').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">
                        {member.display_name || member.email || member.user_id.slice(0, 8)}
                        {isCurrentUser && <span className="text-[var(--color-text-muted)] ml-1">(you)</span>}
                      </p>
                      <p className="text-xs text-[var(--color-text-muted)]">Joined {new Date(member.joined_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {hasRole('owner') && !isCurrentUser ? (
                      <select
                        value={member.role}
                        onChange={(e) => handleChangeRole(member.id, e.target.value as OrgRole)}
                        className="input text-xs py-1 px-2"
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                        ))}
                      </select>
                    ) : (
                      <Badge variant={ROLE_COLORS[member.role] as any}>{member.role}</Badge>
                    )}
                    {!isCurrentUser && !isSoleOwner && hasRole('admin') && (
                      <button
                        onClick={() => setRemovingMember(member)}
                        className="text-[var(--color-text-muted)] hover:text-red-400 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </GlassCard>

      {/* Pending Invites */}
      {invites.length > 0 && (
        <GlassCard className="p-6">
          <h2 className="text-heading text-white mb-4">Pending Invites ({invites.length})</h2>
          <div className="space-y-3">
            {invites.map((invite) => (
              <div key={invite.id} className="flex items-center justify-between p-3 rounded-xl bg-[var(--color-surface)] border border-[var(--glass-border)]">
                <div>
                  <p className="text-sm text-white">{invite.email}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    Expires {new Date(invite.expires_at).toLocaleDateString()} &middot; <Badge variant={ROLE_COLORS[invite.role] as any}>{invite.role}</Badge>
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => handleRevokeInvite(invite.id)}>
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Remove Confirmation Modal */}
      <Modal open={!!removingMember} onClose={() => setRemovingMember(null)} title="Remove Team Member">
        <p className="text-sm text-[var(--color-text-secondary)] mb-6">
          Remove <strong className="text-white">{removingMember?.display_name || removingMember?.email || 'this member'}</strong> from the organization? They will lose access immediately.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setRemovingMember(null)}>Cancel</Button>
          <Button variant="danger" onClick={handleRemoveMember} loading={removeLoading}>Remove</Button>
        </div>
      </Modal>
    </div>
  )
}
