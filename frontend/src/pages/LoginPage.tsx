import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Brain, Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'
import { useState } from 'react'
import { authApi } from '../services/api'
import { useAuthStore } from '../store/auth'

const schema = z.object({
  email:    z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
})
type FormData = z.infer<typeof schema>

export default function LoginPage() {
  const navigate = useNavigate()
  const { setTokens, setUser } = useAuthStore()
  const [showPassword, setShowPassword] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const mutation = useMutation({
    mutationFn: (data: FormData) => authApi.login(data.email, data.password),
    onSuccess: async ({ data }) => {
      setTokens(data.access_token, data.refresh_token)
      const { data: user } = await authApi.me()
      setUser(user)
      navigate('/dashboard')
    },
    onError: () => toast.error('Invalid email or password'),
  })

  return (
    <div className="min-h-screen flex" style={{ background: '#fafafa' }}>

      {/* ── Left: brand panel ───────────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-[52%] flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: '#0d0d11' }}
      >
        {/* Subtle depth gradient */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at 20% 20%, rgba(79,70,229,0.12) 0%, transparent 55%), radial-gradient(ellipse at 80% 80%, rgba(99,102,241,0.07) 0%, transparent 50%)',
          }}
        />

        {/* Logo */}
        <div className="flex items-center gap-2.5 relative z-10">
          <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center">
            <Brain className="w-4.5 h-4.5 text-white" style={{ width: 18, height: 18 }} />
          </div>
          <span className="text-lg font-semibold text-white tracking-tight">MeetingMind</span>
        </div>

        {/* Hero text */}
        <div className="relative z-10 space-y-8">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-400 mb-4">
              AI Meeting Intelligence
            </p>
            <h2 className="text-3xl font-bold text-white leading-snug tracking-tight">
              Every meeting,<br />
              <span className="text-slate-400">turned into action.</span>
            </h2>
            <p className="text-slate-500 mt-4 text-sm leading-relaxed max-w-xs">
              Transcribe, analyse, and deliver AI-powered summaries and action items — automatically, in any Nigerian language.
            </p>
          </div>

          {/* Code window — portfolio-inspired */}
          <div
            className="rounded-lg border p-4 font-mono text-xs leading-relaxed"
            style={{
              background: 'rgba(255,255,255,0.03)',
              borderColor: 'rgba(255,255,255,0.07)',
            }}
          >
            {/* macOS traffic-light dots */}
            <div className="flex items-center gap-1.5 mb-4">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'rgba(255,95,86,0.5)' }} />
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'rgba(255,189,46,0.5)' }} />
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'rgba(39,201,63,0.5)' }} />
              <span className="ml-2 text-slate-700 text-[10px]">meetingmind.ts</span>
            </div>

            <p className="text-slate-500">
              <span className="text-violet-400">const</span>{' '}
              <span className="text-slate-300">result</span>{' '}
              <span className="text-slate-500">=</span>{' '}
              <span className="text-blue-400">await</span>{' '}
              <span className="text-indigo-300">analyse</span>
              <span className="text-slate-500">{'({'}</span>
            </p>
            <p className="text-slate-600 pl-5">
              audio<span className="text-slate-500">:</span>{' '}
              <span className="text-emerald-400">"q4_review.mp3"</span>
              <span className="text-slate-600">,</span>
            </p>
            <p className="text-slate-600 pl-5">
              lang<span className="text-slate-500">:</span>{' '}
              <span className="text-emerald-400">"auto"</span>
              <span className="text-slate-600">,</span>
            </p>
            <p className="text-slate-600 pl-5">
              deliver<span className="text-slate-500">:</span>{' '}
              <span className="text-slate-500">['</span>
              <span className="text-amber-400">whatsapp</span>
              <span className="text-slate-500">',</span>{' '}
              <span className="text-amber-400">email</span>
              <span className="text-slate-500">']</span>
            </p>
            <p className="text-slate-500">{'});'}</p>
            <p className="mt-3">
              <span className="text-slate-700">{'// → '}</span>
              <span style={{ color: 'rgba(52,211,153,0.75)' }}>insights delivered ✓</span>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10">
          <p className="text-slate-700 text-xs tracking-wide">
            Whisper · GPT-4o · Nigerian language support
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
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Welcome back</h1>
            <p className="text-slate-500 text-sm mt-1.5">Sign in to your workspace</p>
          </div>

          <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
            <div>
              <label className="label">Email address</label>
              <input
                {...register('email')}
                type="email"
                className="input"
                placeholder="you@company.com"
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
                  placeholder="••••••••"
                  autoComplete="current-password"
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

            <button
              type="submit"
              disabled={mutation.isPending}
              className="btn-primary w-full py-2.5 mt-2"
            >
              {mutation.isPending ? 'Signing in…' : 'Sign in →'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-100">
            <p className="text-center text-sm text-slate-500">
              Don&apos;t have an account?{' '}
              <Link
                to="/register"
                className="text-indigo-600 font-medium hover:text-indigo-700 transition-colors"
              >
                Create one free
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
