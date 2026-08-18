import { useMemo } from 'react'
import { useSpeechTeleprompter } from '../hooks/useSpeechTeleprompter'
import { computeSentenceRanges, currentSentenceRange } from '../lib/sentences'

interface Props {
  script: string
  onExit: () => void
  onRestart: () => void
}

export function Teleprompter({ script, onExit, onRestart }: Props) {
  const { words, cursor, listening, supported, error } = useSpeechTeleprompter(script)
  const sentenceRanges = useMemo(() => computeSentenceRanges(words), [words])
  const finished = cursor >= words.length

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

  const { start, end } = currentSentenceRange(sentenceRanges, cursor)

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

      {/* Only the current sentence is shown — once its last word is passed,
          currentSentenceRange naturally points at the next one and this
          swaps over, instead of scrolling through the whole script. */}
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="w-full max-w-3xl">
          {finished ? (
            <p className="text-center font-mono text-2xl text-neutral-500 md:text-3xl">done</p>
          ) : (
            <p className="max-h-[50vh] overflow-y-auto font-mono text-2xl leading-relaxed md:text-3xl">
              {words.slice(start, end).map((word, i) => {
                const index = start + i
                return (
                  <span
                    key={index}
                    className={
                      index < cursor
                        ? 'text-neutral-100'
                        : index === cursor
                          ? 'rounded bg-amber-400 px-1 text-neutral-900'
                          : 'text-neutral-600'
                    }
                  >
                    {word}{' '}
                  </span>
                )
              })}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
