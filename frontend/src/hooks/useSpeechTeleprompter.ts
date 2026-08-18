import { useEffect, useRef, useState } from 'react'
import { alignRecentSpeech } from '../lib/alignRecentSpeech'

// How many recently-heard words we keep as context for alignment.
const RECENT_BUFFER_SIZE = 8

// Safety net only: if alignment finds nothing at all for this many
// consecutive updates despite a full buffer of real speech, nudge the
// cursor forward one word rather than stalling indefinitely. This should
// rarely fire — the LCS alignment itself is what keeps things moving.
const STALL_LIMIT = 6

function normalize(word: string) {
  return word.toLowerCase().replace(/[^a-z0-9']/g, '')
}

export function useSpeechTeleprompter(script: string) {
  const words = useRef(script.split(/\s+/).filter(Boolean)).current
  const normalized = useRef(words.map(normalize)).current

  const [cursor, setCursor] = useState(0)
  const [listening, setListening] = useState(false)
  const [supported, setSupported] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const cursorRef = useRef(0)

  useEffect(() => {
    const SpeechRecognitionCtor = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!SpeechRecognitionCtor) {
      setSupported(false)
      return
    }

    const recognition = new SpeechRecognitionCtor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    // The browser re-fires onresult repeatedly while a phrase is still being
    // recognized, each time re-sending the same result slot with a longer
    // transcript ("the" -> "the quick" -> "the quick brown" ...). This tracks
    // how many words we've already consumed from each not-yet-final slot so
    // we only feed newly-appended words into the buffer, instead of
    // re-appending words we've already seen.
    let consumedPerResult = new Map<number, number>()

    let recentSpoken: string[] = []
    let stallCount = 0

    function onNewWords(newWords: string[]) {
      recentSpoken = [...recentSpoken, ...newWords].slice(-RECENT_BUFFER_SIZE)

      const aligned = alignRecentSpeech(recentSpoken, normalized, cursorRef.current)

      if (aligned !== null && aligned > cursorRef.current) {
        cursorRef.current = aligned
        setCursor(aligned)
        stallCount = 0
      } else {
        stallCount++
        if (stallCount >= STALL_LIMIT && recentSpoken.length >= RECENT_BUFFER_SIZE) {
          const nudged = Math.min(cursorRef.current + 1, normalized.length)
          if (nudged !== cursorRef.current) {
            cursorRef.current = nudged
            setCursor(nudged)
          }
          stallCount = 0
        }
      }
    }

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const resultWords = result[0].transcript.trim().split(/\s+/).map(normalize).filter(Boolean)
        const alreadyConsumed = consumedPerResult.get(i) ?? 0
        const newWords = resultWords.slice(alreadyConsumed)

        if (newWords.length) {
          onNewWords(newWords)
          consumedPerResult.set(i, resultWords.length)
        }

        if (result.isFinal) {
          consumedPerResult.delete(i)
        }
      }
    }

    recognition.onerror = () => {
      setError('Mic access was denied or unavailable — allow microphone permission and reload.')
      setListening(false)
    }

    recognition.onend = () => {
      // The browser stops recognition after a pause in speech even with
      // continuous=true, and starting it again begins a brand new result
      // sequence (indices restart from 0). Reset per-session tracking so
      // stale slot counts from the old session don't mis-slice the new one.
      consumedPerResult = new Map()
      stallCount = 0

      if (cursorRef.current < normalized.length) {
        recognition.start()
      } else {
        setListening(false)
      }
    }

    recognition.start()
    setListening(true)

    return () => {
      recognition.onend = null
      recognition.onerror = null
      recognition.stop()
    }
  }, [normalized])

  return { words, cursor, listening, supported, error }
}
