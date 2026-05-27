import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Brain, Eye, EyeOff, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useState } from 'react'
import { authApi } from '../services/api'
import { useAuthStore } from '../store/auth'

const schema = z.object({
  full_name: z.string().min(2, 'Enter your full name'),
  email:     z.string().email('Enter a valid email'),
  password:  z.string().min(8, 'Password must be at least 8 characters'),
  phone:     z.string().optional(),
})
type FormData = z.infer<typeof schema>

const freeFeatures = [
  '5 meetings / month',
  'Nigerian language support',
  'WhatsApp & email delivery',
  'Action item tracking',
  'Team collaboration',
]

export default function RegisterPage() {
  const navigate = useNavigate()
  const { setTokens, setUser } = useAuthStore()
  const [showPassword, setShowPassword] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      await authApi.register(data)
      const { data: tokens } = await authApi.login(data.email, data.password)
      return tokens
    },
    onSuccess: async (tokens) => {
      setTokens(tokens.access_token, tokens.refresh_token)
      const { data: user } = await authApi.me()
      setUser(user)
      toast.success('Welcome to MeetingMind!')
      navigate('/dashboard')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg || 'Registration failed. Please try again.')
    },
  })

  return (
    <div className="min-h-screen flex" style={{ background: '#fafafa' }}>

      {/* ── Left: brand panel ───────────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-[52%] flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: '#0d0d11' }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at 20% 20%, rgba(79,70,229,0.12) 0%, transparent 55%), radial-gradient(ellipse at 80% 80%, rgba(99,102,241,0.07) 0%, transparent 50%)',
          }}
        />

        {/* Logo */}
        <div className="flex items-center gap-2.5 relative z-10">
          <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center">
            <Brain style={{ width: 18, height: 18 }} className="text-white" />
          </div>
          <span className="text-lg font-semibold text-white tracking-tight">MeetingMind</span>
        </div>

        {/* Content */}
        <div className="relative z-10 space-y-8">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-400 mb-4">
              14-Day Free Trial
            </p>
            <h2 className="text-3xl font-bold text-white leading-snug tracking-tight">
              AI-powered meetings<br />
              <span className="text-slate-400">for African teams.</span>
            </h2>
            <p className="text-slate-500 mt-4 text-sm leading-relaxed max-w-xs">
              No credit card required. Get full access to AI transcription, analysis, and delivery in Nigerian languages from day one.
            </p>
          </div>

          {/* Free tier checklist */}
          <div
            className="rounded-lg border p-5"
            style={{
              background: 'rgba(255,255,255,0.03)',
              borderColor: 'rgba(255,255,255,0.07)',
            }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500 mb-4">
              Free tier includes
            </p>
            <ul className="space-y-2.5">
              {freeFeatures.map((f) => (
                <li key={f} className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500/70 flex-shrink-0" />
                  <span className="text-sm text-slate-400">{f}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="relative z-10">
          <p className="text-slate-700 text-xs tracking-wide">
            Trusted by teams across Nigeria & Africa
          </p>
        </div>
      </div>

      {/* ── Right: form panel ───────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-[360px]">

          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-10 lg:hidden">
            <div className="w-7 h-7 rounded-md bg-indigo-500 flex items-center justify-center">
              <Brain className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-slate-900">MeetingMind</span>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Create your account</h1>
            <p className="text-slate-500 text-sm mt-1.5">14-day free trial · No credit card required</p>
          </div>

          <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
            <div>
              <label className="label">Full Name</label>
              <input
                {...register('full_name')}
                className="input"
                placeholder="Chidi Okeke"
                autoComplete="name"
              />
              {errors.full_name && <p className="error-text">{errors.full_name.message}</p>}
            </div>

            <div>
              <label className="label">Work Email</label>
              <input
                {...register('email')}
                type="email"
                className="input"
                placeholder="chidi@company.com"
                autoComplete="email"
              />
              {errors.email && <p className="error-text">{errors.email.message}</p>}
            </div>

            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input
                  {...register('password')}
                  type={showPassword ? 'text' : 'password'}
                  className="input pr-10"
                  placeholder="Min. 8 characters"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="error-text">{errors.password.message}</p>}
            </div>

            <div>
              <label className="label">
                Phone{' '}
                <span className="normal-case font-normal text-slate-400 tracking-normal">(optional — for WhatsApp)</span>
              </label>
              <input
                {...register('phone')}
                className="input"
                placeholder="+234 801 234 5678"
                autoComplete="tel"
              />
            </div>

            <button
              type="submit"
              disabled={mutation.isPending}
              className="btn-primary w-full py-2.5 mt-2"
            >
              {mutation.isPending ? 'Creating account…' : 'Create free account →'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-100">
            <p className="text-center text-sm text-slate-500">
              Already have an account?{' '}
              <Link
                to="/login"
                className="text-indigo-600 font-medium hover:text-indigo-700 transition-colors"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
