import { useEffect, useRef } from 'react'
import { useSpeechTeleprompter } from '../hooks/useSpeechTeleprompter'

interface Props {
  script: string
  onExit: () => void
  onRestart: () => void
}

export function Teleprompter({ script, onExit, onRestart }: Props) {
  const { words, cursor, listening, supported, error } = useSpeechTeleprompter(script)
  const currentRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [cursor])

  if (!supported) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 bg-neutral-900 p-6 text-center text-neutral-100">
        <p className="max-w-md text-red-400">
          Your browser doesn't support live speech recognition. Try Chrome or Edge.
        </p>
        <button type="button" onClick={onExit} className="text-amber-400 underline">
          back
        </button>
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-col bg-neutral-900 text-neutral-100">
      <div className="flex items-center justify-between px-6 py-4 text-sm text-neutral-500">
        <span>{error ? error : listening ? '● listening' : 'stopped'}</span>
        <div className="flex items-center gap-4">
          <button type="button" onClick={onRestart} className="transition hover:text-amber-400">
            restart
          </button>
          <button type="button" onClick={onExit} className="transition hover:text-amber-400">
            exit
          </button>
        </div>
      </div>

      {/* Fixed-height window showing only a few lines at a time, like a real
          teleprompter — text scrolls through it instead of the whole script
          being visible at once. Scrollbar hidden since scrolling is driven
          entirely by the current word, not the user. */}
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="h-44 w-full max-w-3xl overflow-y-auto [scrollbar-width:none] md:h-56 [&::-webkit-scrollbar]:hidden">
          <p className="font-mono text-2xl leading-relaxed md:text-3xl">
            {words.map((word, i) => (
              <span
                key={i}
                ref={i === cursor ? currentRef : null}
                className={
                  i < cursor
                    ? 'text-neutral-100'
                    : i === cursor
                      ? 'rounded bg-amber-400 px-1 text-neutral-900'
                      : 'text-neutral-600'
                }
              >
                {word}{' '}
              </span>
            ))}
          </p>
        </div>
      </div>
    </div>
  )
}
