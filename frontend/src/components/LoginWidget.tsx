import { useState } from 'react'
import type { User } from '../lib/api'

interface Props {
  user: User | null
  onLogin: (username: string) => Promise<void>
  onLogout: () => void
}

export function LoginWidget({ user, onLogin, onLogout }: Props) {
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  async function handleLogin() {
    const trimmed = username.trim()
    if (!trimmed) return
    setLoading(true)
    setError(null)
    try {
      await onLogin(trimmed)
      setUsername('')
    } catch {
      setError('Could not log in — is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-2 text-sm">
      <div className="flex items-center gap-2">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          placeholder="username (optional)"
          className="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
        <button
          type="button"
          onClick={handleLogin}
          disabled={!username.trim() || loading}
          className="rounded-md border border-neutral-700 px-3 py-1.5 text-neutral-300 transition hover:border-amber-400 hover:text-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? '...' : 'log in'}
        </button>
      </div>
      {error && <p className="text-red-400">{error}</p>}
    </div>
  )
}
