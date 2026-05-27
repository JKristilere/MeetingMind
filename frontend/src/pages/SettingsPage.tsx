import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import {
  Building2, Users, Bell, User, Globe, Plus, Crown,
  Shield, Eye, CheckCircle2, Mail, MessageCircle, Smartphone,
  Plug, Copy, ExternalLink, Video, ChevronRight,
} from 'lucide-react'
import { orgApi, userApi } from '../services/api'
import { useAuthStore } from '../store/auth'

type Tab = 'profile' | 'org' | 'members' | 'notifications' | 'integrations'

const ROLE_CONFIG: Record<string, { label: string; classes: string; icon: React.ElementType }> = {
  owner:  { label: 'Owner',  classes: 'bg-amber-100 text-amber-700',   icon: Crown  },
  admin:  { label: 'Admin',  classes: 'bg-indigo-100 text-indigo-700', icon: Shield },
  member: { label: 'Member', classes: 'bg-slate-100 text-slate-600',   icon: User   },
  viewer: { label: 'Viewer', classes: 'bg-slate-100 text-slate-500',   icon: Eye    },
}

export default function SettingsPage() {
  const { currentOrgId, setCurrentOrg, user, setUser } = useAuthStore()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<Tab>('profile')

  /* ── Org queries ─────────────────────────────────────────────── */
  const { data: orgs } = useQuery({
    queryKey: ['organisations'],
    queryFn:  () => orgApi.list(),
  })

  const { data: membersData } = useQuery({
    queryKey: ['members', currentOrgId],
    queryFn:  () => orgApi.members(currentOrgId!),
    enabled:  !!currentOrgId,
  })

  /* ── Profile form ────────────────────────────────────────────── */
  const { register: regProfile, handleSubmit: handleProfile } = useForm({
    defaultValues: {
      full_name:       user?.full_name       ?? '',
      phone:           user?.phone           ?? '',
      whatsapp_number: user?.whatsapp_number ?? '',
    },
  })

  const profileMutation = useMutation({
    mutationFn: (data: { full_name?: string; phone?: string; whatsapp_number?: string }) =>
      userApi.update(data),
    onSuccess: ({ data }) => {
      setUser(data)
      toast.success('Profile updated!')
    },
    onError: () => toast.error('Failed to update profile'),
  })

  /* ── Create org form ────────────────────────────────────────── */
  const { register: regOrg, handleSubmit: handleOrg, reset: resetOrg } = useForm({
    defaultValues: { name: '', industry: '', country: 'NG', timezone: 'Africa/Lagos' },
  })

  const createOrgMutation = useMutation({
    mutationFn: (data: { name: string; industry?: string; country: string; timezone: string }) =>
      orgApi.create(data),
    onSuccess: ({ data }) => {
      setCurrentOrg(data.id)
      queryClient.invalidateQueries({ queryKey: ['organisations'] })
      resetOrg()
      toast.success(`Workspace "${data.name}" created!`)
    },
    onError: () => toast.error('Failed to create workspace'),
  })

  /* ── Invite form ─────────────────────────────────────────────── */
  const { register: regInvite, handleSubmit: handleInvite, reset: resetInvite } = useForm({
    defaultValues: { email: '', role: 'member' },
  })

  const inviteMutation = useMutation({
    mutationFn: ({ email, role }: { email: string; role: string }) =>
      orgApi.inviteMember(currentOrgId!, email, role),
    onSuccess: () => {
      toast.success('Member invited!')
      resetInvite()
      queryClient.invalidateQueries({ queryKey: ['members', currentOrgId] })
    },
    onError: () => toast.error('Failed to invite member'),
  })

  /* ── Zoom webhook URL ─────────────────────────────────────────── */
  const zoomWebhookUrl = currentOrgId
    ? `${window.location.origin}/api/v1/webhooks/zoom/${currentOrgId}`
    : null

  const copyWebhookUrl = () => {
    if (!zoomWebhookUrl) return
    navigator.clipboard.writeText(zoomWebhookUrl).then(() => toast.success('Webhook URL copied!'))
  }

  /* ── Tabs ────────────────────────────────────────────────────── */
  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'profile',       label: 'Profile',       icon: User      },
    { id: 'org',           label: 'Workspace',     icon: Building2 },
    { id: 'members',       label: 'Members',       icon: Users     },
    { id: 'notifications', label: 'Notifications', icon: Bell      },
    { id: 'integrations',  label: 'Integrations',  icon: Plug      },
  ]

  return (
    <div className="max-w-3xl space-y-6">
      {/* ── Page header ─────────────────────────────────────────── */}
      <div>
        <h1 className="page-title">Settings</h1>
        <p className="text-slate-400 text-sm mt-1">
          Manage your profile, workspace, and preferences
        </p>
      </div>

      {/* ── Tab bar ─────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-slate-100/60 rounded-lg p-1 w-fit border border-slate-200/60">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-md text-sm font-medium transition-all duration-150 ${
              activeTab === id
                ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/60'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Profile tab ─────────────────────────────────────────── */}
      {activeTab === 'profile' && (
        <div className="space-y-5">
          <div className="card p-6">
            <div className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-100">
              <div className="w-14 h-14 rounded-xl bg-indigo-500 flex items-center justify-center text-white text-2xl font-bold">
                {user?.full_name?.[0]?.toUpperCase() ?? 'U'}
              </div>
              <div>
                <p className="font-semibold text-slate-900 text-base">{user?.full_name}</p>
                <p className="text-slate-400 text-sm">{user?.email}</p>
                <div className="flex items-center gap-1.5 mt-1.5">
                  {user?.is_verified && (
                    <span className="badge bg-emerald-100 text-emerald-700 gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Verified
                    </span>
                  )}
                  {user?.is_active && (
                    <span className="badge bg-indigo-100 text-indigo-700">Active</span>
                  )}
                </div>
              </div>
            </div>

            <form
              onSubmit={handleProfile((d) => profileMutation.mutate(d))}
              className="space-y-4"
            >
              <div>
                <label className="label">Full Name</label>
                <input {...regProfile('full_name')} className="input" placeholder="Your full name" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5 text-slate-400" />
                    Phone
                  </label>
                  <input
                    {...regProfile('phone')}
                    className="input"
                    placeholder="+234 801 234 5678"
                  />
                </div>
                <div>
                  <label className="label flex items-center gap-1.5">
                    <MessageCircle className="w-3.5 h-3.5 text-emerald-500" />
                    WhatsApp
                  </label>
                  <input
                    {...regProfile('whatsapp_number')}
                    className="input"
                    placeholder="+234 801 234 5678"
                  />
                </div>
              </div>
              <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-100">
                <p className="text-xs text-indigo-700 leading-relaxed">
                  <strong>WhatsApp tip:</strong> Add your WhatsApp number to receive action items
                  automatically after each meeting. Nigerian format: +234 80x xxx xxxx
                </p>
              </div>
              <button
                type="submit"
                disabled={profileMutation.isPending}
                className="btn-primary"
              >
                {profileMutation.isPending ? 'Saving…' : 'Save Profile'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Workspace tab ───────────────────────────────────────── */}
      {activeTab === 'org' && (
        <div className="space-y-5">
          {orgs?.data && orgs.data.length > 0 && (
            <div className="card p-6">
              <h3 className="section-title mb-4 flex items-center gap-2">
                <Globe className="w-4 h-4 text-indigo-500" />
                Your Workspaces
              </h3>
              <div className="space-y-2">
                {orgs.data.map((org) => (
                  <div
                    key={org.id}
                    onClick={() => setCurrentOrg(org.id)}
                    className={`flex items-center justify-between p-3.5 rounded-lg border cursor-pointer transition-all duration-150 ${
                      currentOrgId === org.id
                        ? 'border-indigo-200 bg-indigo-50/60'
                        : 'border-slate-100 hover:bg-slate-50 hover:border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm ${
                        currentOrgId === org.id ? 'bg-indigo-500' : 'bg-slate-200 text-slate-500'
                      }`}>
                        {org.name[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900">{org.name}</p>
                        <p className="text-xs text-slate-400">
                          {org.industry ?? 'No industry'} · {org.timezone}
                        </p>
                      </div>
                    </div>
                    {currentOrgId === org.id && (
                      <span className="status-badge bg-indigo-100 text-indigo-700">Active</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card p-6">
            <h3 className="section-title mb-4 flex items-center gap-2">
              <Plus className="w-4 h-4 text-indigo-500" />
              {orgs?.data?.length ? 'Create New Workspace' : 'Create Your First Workspace'}
            </h3>
            <form onSubmit={handleOrg((d) => createOrgMutation.mutate(d))} className="space-y-4">
              <div>
                <label className="label">Company / Team Name</label>
                <input
                  {...regOrg('name', { required: true })}
                  className="input"
                  placeholder="Acme Nigeria Ltd."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Industry</label>
                  <input
                    {...regOrg('industry')}
                    className="input"
                    placeholder="Fintech, FMCG…"
                  />
                </div>
                <div>
                  <label className="label">Timezone</label>
                  <select {...regOrg('timezone')} className="input">
                    <option value="Africa/Lagos">Africa/Lagos (WAT)</option>
                    <option value="Africa/Nairobi">Africa/Nairobi (EAT)</option>
                    <option value="Africa/Accra">Africa/Accra (GMT)</option>
                    <option value="Africa/Johannesburg">Africa/Johannesburg (SAST)</option>
                    <option value="Africa/Cairo">Africa/Cairo (EET)</option>
                  </select>
                </div>
              </div>
              <button
                type="submit"
                disabled={createOrgMutation.isPending}
                className="btn-primary"
              >
                {createOrgMutation.isPending ? 'Creating…' : 'Create Workspace'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Members tab ─────────────────────────────────────────── */}
      {activeTab === 'members' && (
        <div className="space-y-5">
          {currentOrgId ? (
            <>
              <div className="card p-6">
                <h3 className="section-title mb-4 flex items-center gap-2">
                  <Mail className="w-4 h-4 text-indigo-500" />
                  Invite Team Member
                </h3>
                <form
                  onSubmit={handleInvite((d) => inviteMutation.mutate(d))}
                  className="flex flex-col sm:flex-row gap-3"
                >
                  <input
                    {...regInvite('email', { required: true })}
                    type="email"
                    className="input flex-1"
                    placeholder="colleague@company.com"
                  />
                  <select {...regInvite('role')} className="input sm:w-32">
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <button
                    type="submit"
                    disabled={inviteMutation.isPending}
                    className="btn-primary whitespace-nowrap"
                  >
                    {inviteMutation.isPending ? 'Sending…' : 'Send Invite'}
                  </button>
                </form>
              </div>

              <div className="card p-6">
                <h3 className="section-title mb-4 flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-500" />
                  Team Members
                </h3>
                {(membersData?.data as unknown[])?.length ? (
                  <div className="space-y-2">
                    {(membersData!.data as { user_id: string; full_name: string; email: string; role: string }[]).map(
                      (m) => {
                        const roleCfg = ROLE_CONFIG[m.role] ?? ROLE_CONFIG.member
                        const RoleIcon = roleCfg.icon
                        return (
                          <div
                            key={m.user_id}
                            className="flex items-center gap-3 p-3.5 rounded-lg bg-slate-50/60 border border-slate-100"
                          >
                            <div className="w-9 h-9 rounded-full bg-indigo-500 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                              {m.full_name?.[0]?.toUpperCase() ?? '?'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-900">{m.full_name}</p>
                              <p className="text-xs text-slate-400 truncate">{m.email}</p>
                            </div>
                            <span className={`badge gap-1 ${roleCfg.classes}`}>
                              <RoleIcon className="w-3 h-3" />
                              {roleCfg.label}
                            </span>
                          </div>
                        )
                      },
                    )}
                  </div>
                ) : (
                  <div className="py-8 text-center">
                    <Users className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">No members yet. Invite your team!</p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="card p-12 text-center">
              <Building2 className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">Create a workspace first to manage members.</p>
              <button
                onClick={() => setActiveTab('org')}
                className="btn-secondary mt-4 text-sm"
              >
                Create workspace
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Notifications tab ────────────────────────────────────── */}
      {activeTab === 'notifications' && (
        <div className="card p-6">
          <h3 className="section-title mb-6 flex items-center gap-2">
            <Bell className="w-4 h-4 text-indigo-500" />
            Notification Preferences
          </h3>

          <div className="space-y-3">
            {[
              {
                icon: MessageCircle,
                iconBg: 'bg-emerald-100 text-emerald-600',
                label: 'WhatsApp notifications',
                desc: 'Receive action items on WhatsApp after each meeting',
                id: 'whatsapp',
              },
              {
                icon: Mail,
                iconBg: 'bg-indigo-100 text-indigo-600',
                label: 'Email notifications',
                desc: 'Receive meeting summaries via email',
                id: 'email',
              },
              {
                icon: Bell,
                iconBg: 'bg-amber-100 text-amber-600',
                label: 'In-app notifications',
                desc: 'Show notifications within the dashboard',
                id: 'in_app',
              },
            ].map(({ icon: Icon, iconBg, label, desc, id }) => (
              <div
                key={id}
                className="flex items-center gap-4 p-4 rounded-lg border border-slate-100 bg-slate-50/40"
              >
                <div className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center flex-shrink-0`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900">{label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                  <input type="checkbox" defaultChecked className="sr-only peer" />
                  <div className="w-9 h-5 bg-slate-200 rounded-full peer peer-checked:bg-indigo-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4 after:shadow-sm" />
                </label>
              </div>
            ))}
          </div>

          <div className="mt-5 p-4 bg-emerald-50 rounded-lg border border-emerald-100">
            <div className="flex items-start gap-2">
              <MessageCircle className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-emerald-700 leading-relaxed">
                <strong>WhatsApp tip:</strong> Add your WhatsApp number in Profile to receive instant
                action item notifications. Nigerian format: +234 80x xxx xxxx
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Integrations tab ─────────────────────────────────────── */}
      {activeTab === 'integrations' && (
        <div className="space-y-5">

          {/* Zoom Cloud Recording */}
          <div className="card p-6">
            <div className="flex items-center gap-3 mb-6 pb-5 border-b border-slate-100">
              <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center flex-shrink-0">
                <Video className="w-5 h-5 text-sky-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">Zoom Cloud Recording</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Auto-import recordings when a Zoom meeting ends
                </p>
              </div>
            </div>

            {!currentOrgId ? (
              <div className="p-4 bg-amber-50 rounded-lg border border-amber-100 text-xs text-amber-700">
                Create a workspace first before setting up integrations.
              </div>
            ) : (
              <div className="space-y-6">

                {[
                  {
                    n: 1,
                    title: 'Create a Zoom app',
                    body: (
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Go to the{' '}
                        <a
                          href="https://marketplace.zoom.us/develop/create"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:underline inline-flex items-center gap-0.5"
                        >
                          Zoom Marketplace <ExternalLink className="w-3 h-3" />
                        </a>{' '}
                        and create a <strong>Server-to-Server OAuth</strong> app (free).
                        Activate it, then open <strong>Feature → Event Subscriptions</strong>.
                      </p>
                    ),
                  },
                ].map(({ n, title, body }) => (
                  <div key={n} className="flex gap-4">
                    <div className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5 tabular-nums">
                      {n}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 mb-1">{title}</p>
                      {body}
                    </div>
                  </div>
                ))}

                {/* Step 2 */}
                <div className="flex gap-4">
                  <div className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                    2
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 mb-1">Add your webhook URL</p>
                    <p className="text-xs text-slate-500 mb-2 leading-relaxed">
                      In Event Subscriptions, paste this URL as the <strong>Event notification endpoint URL</strong>:
                    </p>
                    <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <code className="text-xs text-slate-700 flex-1 break-all font-mono">
                        {zoomWebhookUrl}
                      </code>
                      <button
                        onClick={copyWebhookUrl}
                        className="flex-shrink-0 p-1.5 rounded-md hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors"
                        title="Copy URL"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="flex gap-4">
                  <div className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                    3
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 mb-1">
                      Subscribe to the recording event
                    </p>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Click <strong>+ Add Event</strong> and add:{' '}
                      <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700">
                        Recording → Cloud Recording Completed
                      </code>.
                      Zoom will send a validation request — MeetingMind handles it automatically.
                    </p>
                  </div>
                </div>

                {/* Step 4 */}
                <div className="flex gap-4">
                  <div className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                    4
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 mb-1">
                      Copy the Secret Token to your .env
                    </p>
                    <p className="text-xs text-slate-500 mb-2 leading-relaxed">
                      After saving, Zoom shows a <strong>Secret Token</strong> on the Event Subscriptions
                      page. Add it to your server&apos;s environment:
                    </p>
                    <pre className="p-3 bg-slate-900 text-emerald-400 rounded-lg text-xs font-mono overflow-x-auto">
                      ZOOM_WEBHOOK_SECRET_TOKEN=your_secret_token_here
                    </pre>
                    <p className="text-xs text-slate-400 mt-1.5">
                      Then restart the backend container.
                    </p>
                  </div>
                </div>

                {/* Step 5 */}
                <div className="flex gap-4">
                  <div className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                    5
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 mb-1">
                      Enable cloud recording in Zoom
                    </p>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      In your Zoom account go to <strong>Settings → Recording → Cloud recording</strong> and
                      turn it on. When a meeting ends, the recording will appear automatically in{' '}
                      <strong>Meetings</strong> within a few minutes.
                    </p>
                  </div>
                </div>

                {/* How it works */}
                <div className="p-4 bg-indigo-50 rounded-lg border border-indigo-100">
                  <p className="text-xs font-semibold text-indigo-800 mb-2">How it works</p>
                  <div className="space-y-1.5">
                    {[
                      'Zoom meeting ends → cloud recording is processed by Zoom',
                      'Zoom calls your webhook with the recording download URL',
                      'MeetingMind downloads the audio and transcribes it with Whisper',
                      'AI analysis runs and action items are extracted',
                      'Summary + action items are delivered via WhatsApp & email',
                    ].map((step, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <ChevronRight className="w-3.5 h-3.5 text-indigo-400 mt-0.5 flex-shrink-0" />
                        <span className="text-xs text-indigo-700">{step}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Requirements */}
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
                  <p className="text-xs text-amber-700 leading-relaxed">
                    <strong>Requirements:</strong> Zoom Pro, Business, or higher plan (cloud recording
                    is not available on the free Zoom tier). The Zoom host&apos;s email should match
                    a MeetingMind account in this workspace.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
