import { useCallback, useEffect, useRef, useState } from 'react'
import { useSpeechTeleprompter } from '../hooks/useSpeechTeleprompter'
import * as api from '../lib/api'

interface Props {
  script: string
  userId: number | null
  scriptId: number | null
  onExit: () => void
  onRestart: () => void
}

interface Stats {
  wpm: number
  wordsCompleted: number
  totalWords: number
  durationSeconds: number
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function Teleprompter({ script, userId, scriptId, onExit, onRestart }: Props) {
  const { words, cursor, listening, supported, error } = useSpeechTeleprompter(script)
  const currentRef = useRef<HTMLSpanElement>(null)

  const startedAtRef = useRef(new Date().toISOString())
  const recordedRef = useRef(false)
  const [stats, setStats] = useState<Stats | null>(null)

  // Records one practice-session row (best-effort, silently skipped if
  // logged out or the script wasn't saved). Guarded so it only ever fires
  // once per mount, whether that's from finishing the script, exiting, or
  // restarting — all three call this before anything else happens.
  const recordSession = useCallback(() => {
    if (recordedRef.current) return
    recordedRef.current = true
    if (userId === null || scriptId === null) return

    api
      .createSession({
        scriptId,
        userId,
        startedAt: startedAtRef.current,
        endedAt: new Date().toISOString(),
        wordsCompleted: cursor,
        totalWords: words.length,
      })
      .catch(() => {
        // Metrics are best-effort — don't interrupt the user over this.
      })
  }, [userId, scriptId, cursor, words.length])

  useEffect(() => {
    if (words.length > 0 && cursor >= words.length) {
      // Stats are computed client-side from the same data the session POST
      // uses, so they show up whether or not you're logged in — persisting
      // them is a bonus, not a requirement for seeing them.
      if (!recordedRef.current) {
        const durationSeconds = Math.max(
          (Date.now() - new Date(startedAtRef.current).getTime()) / 1000,
          1,
        )
        setStats({
          wpm: Math.round((cursor / durationSeconds) * 60),
          wordsCompleted: cursor,
          totalWords: words.length,
          durationSeconds: Math.round(durationSeconds),
        })
      }
      recordSession()
    }
  }, [cursor, words.length, recordSession])

  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [cursor])

  const handleExit = () => {
    recordSession()
    onExit()
  }

  const handleRestart = () => {
    recordSession()
    onRestart()
  }

  if (!supported) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 bg-neutral-900 p-6 text-center text-neutral-100">
        <p className="max-w-md text-red-400">
          Your browser doesn't support live speech recognition. Try Chrome or Edge.
        </p>
        <button type="button" onClick={handleExit} className="text-amber-400 underline">
          back
        </button>
      </div>
    )
  }

  return (
    <div className="relative flex min-h-full flex-col bg-neutral-900 text-neutral-100">
      <div className="flex items-center justify-between px-6 py-4 text-sm text-neutral-500">
        <span>{error ? error : listening ? '● listening' : 'stopped'}</span>
        <div className="flex items-center gap-4">
          <button type="button" onClick={handleRestart} className="transition hover:text-amber-400">
            restart
          </button>
          <button type="button" onClick={handleExit} className="transition hover:text-amber-400">
            exit
          </button>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-6">
        {stats ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <h2 className="text-3xl font-semibold text-amber-400">nice work!</h2>
            <p className="text-xl text-neutral-100">{stats.wpm} words per minute</p>
            <p className="text-sm text-neutral-500">
              {stats.wordsCompleted}/{stats.totalWords} words · {formatDuration(stats.durationSeconds)}
            </p>
          </div>
        ) : (
          // The whole script stays in the DOM; this fixed-height window
          // shows only a few lines of it at a time, and scrolls smoothly to
          // keep the current word centered as it advances — like a real
          // teleprompter, rather than swapping discrete chunks in and out.
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
        )}
      </div>
    </div>
  )
}
