import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { Building, Users, Bell } from 'lucide-react'
import { orgApi } from '../services/api'
import { useAuthStore } from '../store/auth'

export default function SettingsPage() {
  const { currentOrgId, setCurrentOrg, user } = useAuthStore()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'org' | 'members' | 'notifications'>('org')

  const { data: orgs } = useQuery({
    queryKey: ['organisations'],
    queryFn: () => orgApi.list(),
  })

  const { register: regOrg, handleSubmit: handleOrg } = useForm({
    defaultValues: { name: '', industry: '', country: 'NG', timezone: 'Africa/Lagos' },
  })

  const createOrgMutation = useMutation({
    mutationFn: (data: { name: string; industry?: string; country: string; timezone: string }) =>
      orgApi.create(data),
    onSuccess: ({ data }) => {
      setCurrentOrg(data.id)
      queryClient.invalidateQueries({ queryKey: ['organisations'] })
      toast.success(`Workspace "${data.name}" created!`)
    },
    onError: () => toast.error('Failed to create workspace'),
  })

  const { register: regInvite, handleSubmit: handleInvite, reset: resetInvite } = useForm({
    defaultValues: { email: '', role: 'member' },
  })

  const inviteMutation = useMutation({
    mutationFn: ({ email, role }: { email: string; role: string }) =>
      orgApi.inviteMember(currentOrgId!, email, role),
    onSuccess: () => {
      toast.success('Member invited successfully')
      resetInvite()
    },
    onError: () => toast.error('Failed to invite member'),
  })

  const { data: membersData } = useQuery({
    queryKey: ['members', currentOrgId],
    queryFn: () => orgApi.members(currentOrgId!),
    enabled: !!currentOrgId,
  })

  const tabs = [
    { id: 'org', label: 'Workspace', icon: Building },
    { id: 'members', label: 'Members', icon: Users },
    { id: 'notifications', label: 'Notifications', icon: Bell },
  ] as const

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 text-sm mt-1">Manage your workspace and preferences</p>
      </div>

      <div className="flex border-b border-gray-200 gap-1">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === id
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'org' && (
        <div className="space-y-5">
          {/* Existing orgs */}
          {orgs?.data && orgs.data.length > 0 && (
            <div className="card p-5">
              <h3 className="font-semibold text-gray-900 mb-3">Your Workspaces</h3>
              <div className="space-y-2">
                {orgs.data.map((org) => (
                  <div
                    key={org.id}
                    className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                      currentOrgId === org.id
                        ? 'border-primary-300 bg-primary-50'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                    onClick={() => setCurrentOrg(org.id)}
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">{org.name}</p>
                      <p className="text-xs text-gray-500">{org.industry || 'No industry set'} · {org.timezone}</p>
                    </div>
                    {currentOrgId === org.id && (
                      <span className="status-badge bg-primary-100 text-primary-700">Active</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Create org */}
          <div className="card p-5">
            <h3 className="font-semibold text-gray-900 mb-4">
              {orgs?.data?.length ? 'Create New Workspace' : 'Create Your First Workspace'}
            </h3>
            <form onSubmit={handleOrg((d) => createOrgMutation.mutate(d))} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                <input {...regOrg('name', { required: true })} className="input" placeholder="Acme Nigeria Ltd." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
                  <input {...regOrg('industry')} className="input" placeholder="Fintech, FMCG…" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
                  <select {...regOrg('timezone')} className="input">
                    <option value="Africa/Lagos">Africa/Lagos (WAT)</option>
                    <option value="Africa/Nairobi">Africa/Nairobi (EAT)</option>
                    <option value="Africa/Accra">Africa/Accra (GMT)</option>
                    <option value="Africa/Johannesburg">Africa/Johannesburg (SAST)</option>
                    <option value="Africa/Cairo">Africa/Cairo (EET)</option>
                  </select>
                </div>
              </div>
              <button type="submit" disabled={createOrgMutation.isPending} className="btn-primary">
                {createOrgMutation.isPending ? 'Creating…' : 'Create Workspace'}
              </button>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'members' && (
        <div className="space-y-5">
          {currentOrgId ? (
            <>
              <div className="card p-5">
                <h3 className="font-semibold text-gray-900 mb-4">Invite Team Member</h3>
                <form
                  onSubmit={handleInvite((d) => inviteMutation.mutate(d))}
                  className="flex gap-3"
                >
                  <input
                    {...regInvite('email', { required: true })}
                    type="email"
                    className="input flex-1"
                    placeholder="colleague@company.com"
                  />
                  <select {...regInvite('role')} className="input w-32">
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <button type="submit" disabled={inviteMutation.isPending} className="btn-primary whitespace-nowrap">
                    {inviteMutation.isPending ? 'Inviting…' : 'Invite'}
                  </button>
                </form>
              </div>

              <div className="card p-5">
                <h3 className="font-semibold text-gray-900 mb-3">Team Members</h3>
                {membersData?.data && (membersData.data as unknown[]).length > 0 ? (
                  <div className="space-y-2">
                    {(membersData.data as { user_id: string; full_name: string; email: string; role: string }[]).map((m) => (
                      <div key={m.user_id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
                        <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-medium text-sm">
                          {m.full_name?.[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">{m.full_name}</p>
                          <p className="text-xs text-gray-500">{m.email}</p>
                        </div>
                        <span className="status-badge bg-gray-100 text-gray-600">{m.role}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 text-center py-4">No members yet. Invite your team!</p>
                )}
              </div>
            </>
          ) : (
            <div className="card p-6 text-center text-gray-400">
              <p className="text-sm">Create a workspace first to manage members.</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'notifications' && (
        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Notification Preferences</h3>
          <div className="space-y-4">
            {[
              { label: 'WhatsApp notifications', desc: 'Receive action items on WhatsApp after each meeting', id: 'whatsapp' },
              { label: 'Email notifications', desc: 'Receive meeting summaries via email', id: 'email' },
              { label: 'In-app notifications', desc: 'Show notifications within the dashboard', id: 'in_app' },
            ].map(({ label, desc, id }) => (
              <div key={id} className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">{label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" defaultChecked className="sr-only peer" />
                  <div className="w-10 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:bg-primary-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-4" />
                </label>
              </div>
            ))}
          </div>
          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
            <p className="text-xs text-blue-700">
              <strong>WhatsApp tip:</strong> Add your WhatsApp number in your profile to receive instant action item notifications after every meeting. Nigerian numbers: +234 80x xxx xxxx
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
