import { useState } from 'react'
import { LoginWidget } from './LoginWidget'
import { ScriptHistory } from './ScriptHistory'
import type { Script, ScriptLength, User } from '../lib/api'

type Source = 'pasted' | 'generated'

interface Props {
  user: User | null
  onLogin: (username: string) => Promise<void>
  onLogout: () => void
  scripts: Script[]
  onSelectScript: (script: Script) => void
  onStart: (script: string, options: { autoSave: boolean; scriptId: number | null }) => void
  onGenerateScript: (prompt: string, length: ScriptLength) => Promise<{ text: string }>
  onSaveScript: (text: string) => Promise<Script | null>
}

const LENGTH_LABELS: Record<ScriptLength, string> = {
  short: 'short (~60 words)',
  medium: 'medium (~150 words)',
  long: 'long (~300 words)',
}

export function SetupScreen({
  user,
  onLogin,
  onLogout,
  scripts,
  onSelectScript,
  onStart,
  onGenerateScript,
  onSaveScript,
}: Props) {
  const [text, setText] = useState('')
  const [source, setSource] = useState<Source>('pasted')
  const [savedScriptId, setSavedScriptId] = useState<number | null>(null)

  const [prompt, setPrompt] = useState('')
  const [length, setLength] = useState<ScriptLength>('medium')
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function handleTextChange(value: string) {
    setText(value)
    // Editing the text yourself, even after a generation, means it's no
    // longer "the generated script" in any saveable sense.
    setSource('pasted')
    setSavedScriptId(null)
  }

  async function handleGenerate() {
    const trimmedPrompt = prompt.trim()
    if (!trimmedPrompt) return
    setGenerating(true)
    setGenerateError(null)
    try {
      const { text: generated } = await onGenerateScript(trimmedPrompt, length)
      setText(generated)
      setSource('generated')
      setSavedScriptId(null)
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Could not generate a script.')
    } finally {
      setGenerating(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const created = await onSaveScript(text)
      if (created) setSavedScriptId(created.id)
    } finally {
      setSaving(false)
    }
  }

  function handleStart() {
    const trimmed = text.trim()
    if (!trimmed) return
    onStart(trimmed, {
      autoSave: source === 'pasted',
      scriptId: source === 'generated' ? savedScriptId : null,
    })
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-6 bg-neutral-900 p-6 text-neutral-100">
      <div className="flex w-full max-w-2xl justify-end">
        <LoginWidget user={user} onLogin={onLogin} onLogout={onLogout} />
      </div>

      <h1 className="text-3xl font-semibold tracking-tight text-amber-400">speechapp</h1>

      {user && <ScriptHistory scripts={scripts} onSelect={onSelectScript} />}

      <div className="w-full max-w-2xl rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
        <p className="mb-2 text-sm text-neutral-400">generate a script about...</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
            placeholder="a topic or prompt..."
            className="flex-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <select
            value={length}
            onChange={(e) => setLength(e.target.value as ScriptLength)}
            className="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-neutral-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            {(Object.keys(LENGTH_LABELS) as ScriptLength[]).map((key) => (
              <option key={key} value={key}>
                {LENGTH_LABELS[key]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!prompt.trim() || generating}
            className="rounded-md border border-neutral-700 px-4 py-2 text-neutral-300 transition hover:border-amber-400 hover:text-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {generating ? 'generating...' : 'generate'}
          </button>
        </div>
        {generateError && <p className="mt-2 text-sm text-red-400">{generateError}</p>}
      </div>

      <p className="text-xs text-neutral-600">or paste your own below</p>

      <textarea
        value={text}
        onChange={(e) => handleTextChange(e.target.value)}
        placeholder="paste your script here..."
        className="h-64 w-full max-w-2xl resize-none rounded-lg border border-neutral-700 bg-neutral-800 p-4 font-mono text-lg text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
      />

      {source === 'generated' && (
        <div className="flex items-center gap-3 text-sm text-neutral-400">
          <span>✦ generated script</span>
          {user &&
            (savedScriptId !== null ? (
              <span className="text-green-400">saved</span>
            ) : (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="text-amber-400 underline transition hover:text-amber-300 disabled:opacity-40"
              >
                {saving ? 'saving...' : 'save to my account'}
              </button>
            ))}
        </div>
      )}

      <button
        type="button"
        onClick={handleStart}
        disabled={!text.trim()}
        className="rounded-md bg-amber-400 px-6 py-2 font-medium text-neutral-900 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
      >
        start
      </button>
    </div>
  )
}
