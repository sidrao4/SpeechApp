import { useState } from 'react'
import type { FormEvent } from 'react'
import type { User } from '../lib/api'

interface Props {
  user: User | null
  checking: boolean
  googleEnabled: boolean
  redirectError: string | null
  onLogin: (username: string, password: string) => Promise<void>
  onRegister: (username: string, password: string) => Promise<void>
  onLogout: () => Promise<void>
  onGoogle: () => void
}

type Mode = 'login' | 'register'

const inputClass =
  'w-36 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-400'
const buttonClass =
  'rounded-md border border-neutral-700 px-3 py-1.5 text-neutral-300 transition hover:border-amber-400 hover:text-amber-400 disabled:cursor-not-allowed disabled:opacity-40'

export function LoginWidget({
  user,
  checking,
  googleEnabled,
  redirectError,
  onLogin,
  onRegister,
  onLogout,
  onGoogle,
}: Props) {
  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (checking) {
    return <p className="text-sm text-neutral-500">checking session…</p>
  }

  if (user) {
    return (
      <div className="flex items-center gap-3 text-sm text-neutral-400">
        <span>
          logged in as <span className="text-neutral-100">{user.username}</span>
        </span>
        <button
          type="button"
          onClick={onLogout}
          className="text-amber-400 underline transition hover:text-amber-300"
        >
          log out
        </button>
      </div>
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!username.trim() || !password) return
    setLoading(true)
    setError(null)
    try {
      await (mode === 'login' ? onLogin : onRegister)(username.trim(), password)
      setUsername('')
      setPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong — is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  const shownError = error ?? redirectError

  return (
    <div className="flex flex-col items-end gap-2 text-sm">
      <form onSubmit={handleSubmit} className="flex flex-wrap items-center justify-end gap-2">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="username"
          autoComplete="username"
          className={inputClass}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={mode === 'register' ? 'password (8+ chars)' : 'password'}
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          className={inputClass}
        />
        <button type="submit" disabled={!username.trim() || !password || loading} className={buttonClass}>
          {loading ? '...' : mode === 'login' ? 'log in' : 'sign up'}
        </button>
      </form>
      <div className="flex items-center gap-3 text-neutral-500">
        <button
          type="button"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login')
            setError(null)
          }}
          className="underline transition hover:text-neutral-300"
        >
          {mode === 'login' ? 'new here? sign up' : 'have an account? log in'}
        </button>
        {googleEnabled && (
          <button type="button" onClick={onGoogle} className={buttonClass}>
            continue with Google
          </button>
        )}
      </div>
      {shownError && <p className="text-red-400">{shownError}</p>}
    </div>
  )
}
