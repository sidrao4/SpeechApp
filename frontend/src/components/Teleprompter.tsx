import { useEffect, useRef } from 'react'
import { useSpeechTeleprompter } from '../hooks/useSpeechTeleprompter'

interface Props {
  script: string
  onExit: () => void
}

export function Teleprompter({ script, onExit }: Props) {
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
        <button type="button" onClick={onExit} className="transition hover:text-amber-400">
          exit
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-16 md:px-24">
        <p className="mx-auto max-w-3xl font-mono text-2xl leading-relaxed md:text-3xl">
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
  )
}
