import { useState } from 'react'
import { LoginWidget } from './LoginWidget'
import { ScriptHistory } from './ScriptHistory'
import type { Script, User } from '../lib/api'

interface Props {
  user: User | null
  onLogin: (username: string) => Promise<void>
  onLogout: () => void
  scripts: Script[]
  onSelectScript: (script: Script) => void
  onStart: (script: string) => void
}

export function SetupScreen({
  user,
  onLogin,
  onLogout,
  scripts,
  onSelectScript,
  onStart,
}: Props) {
  const [text, setText] = useState('')

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-6 bg-neutral-900 p-6 text-neutral-100">
      <div className="flex w-full max-w-2xl justify-end">
        <LoginWidget user={user} onLogin={onLogin} onLogout={onLogout} />
      </div>

      <h1 className="text-3xl font-semibold tracking-tight text-amber-400">speechapp</h1>

      {user && <ScriptHistory scripts={scripts} onSelect={onSelectScript} />}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="paste your script here..."
        className="h-64 w-full max-w-2xl resize-none rounded-lg border border-neutral-700 bg-neutral-800 p-4 font-mono text-lg text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
      />
      <button
        type="button"
        onClick={() => text.trim() && onStart(text.trim())}
        disabled={!text.trim()}
        className="rounded-md bg-amber-400 px-6 py-2 font-medium text-neutral-900 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
      >
        start
      </button>
    </div>
  )
}
