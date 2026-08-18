import type { Script } from '../lib/api'

interface Props {
  scripts: Script[]
  onSelect: (script: Script) => void
}

function formatReadTime(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  return minutes < 1 ? '<1 min' : `~${minutes} min`
}

function preview(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ')
  return trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed
}

export function ScriptHistory({ scripts, onSelect }: Props) {
  if (!scripts.length) {
    return (
      <p className="text-sm text-neutral-500">No saved scripts yet — start one below to save it here.</p>
    )
  }

  return (
    <div className="w-full max-w-2xl">
      <h2 className="mb-2 text-sm font-medium text-neutral-400">your scripts</h2>
      <ul className="flex flex-col gap-2">
        {scripts.map((script) => (
          <li key={script.id}>
            <button
              type="button"
              onClick={() => onSelect(script)}
              className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-4 py-2 text-left transition hover:border-amber-400"
            >
              <p className="truncate text-neutral-100">{preview(script.text)}</p>
              <p className="text-xs text-neutral-500">
                {script.word_count} words · {formatReadTime(script.est_read_time_seconds)}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
