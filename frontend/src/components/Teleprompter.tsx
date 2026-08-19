import { useCallback, useEffect, useRef, useState } from 'react'
import { useSpeechTeleprompter } from '../hooks/useSpeechTeleprompter'
import { CameraPreview } from './CameraPreview'
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

  // saves a session row, best effort - skips quietly if you're not logged
  // in or the script never got saved. guarded so it only fires once per
  // mount no matter which of finish/exit/restart triggers it first
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
        // best-effort, don't bug the user about it
      })
  }, [userId, scriptId, cursor, words.length])

  useEffect(() => {
    if (words.length > 0 && cursor >= words.length) {
      // computed from the same data the session POST uses, so these show
      // up either way - saving them is a bonus, not required to see them
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
          // whole script stays in the dom, this box just shows a few lines
          // at a time and scrolls to keep the current word centered
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

      <CameraPreview finished={stats !== null} />
    </div>
  )
}
