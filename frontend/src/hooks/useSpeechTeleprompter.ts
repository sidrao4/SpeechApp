import { useEffect, useRef, useState } from 'react'

// How far ahead of the current word we'll search for a match. Keeps a
// misheard word from making the cursor jump to some unrelated later
// occurrence of a common word (e.g. "the") elsewhere in the script.
const LOOKAHEAD = 8

// If this many spoken words in a row don't match anything at all (not even
// a pending jump candidate), assume the expected word was just misheard by
// the recognizer and move past it — getting permanently stuck is worse for
// a live teleprompter than occasionally skipping one bad word.
const STALE_LIMIT = 4

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
    // we only feed newly-appended words into the matcher, instead of
    // re-matching words we've already advanced past.
    let consumedPerResult = new Map<number, number>()

    // A candidate jump of more than one word ahead — held here rather than
    // committed immediately, so a single misheard/noise word can't fling the
    // cursor to a coincidental match further down the script. It's only
    // committed once the *next* spoken word confirms the word right after it.
    let pendingCandidate: { index: number } | null = null

    // Consecutive spoken words that matched nothing at all — see STALE_LIMIT.
    let staleWordCount = 0

    function advanceCursor(spoken: string[]) {
      let cur = cursorRef.current

      for (const word of spoken) {
        let matched = false

        if (pendingCandidate && normalized[pendingCandidate.index] === word) {
          cur = pendingCandidate.index + 1
          pendingCandidate = null
          matched = true
        } else {
          pendingCandidate = null

          const windowEnd = Math.min(cur + LOOKAHEAD, normalized.length)
          for (let i = cur; i < windowEnd; i++) {
            if (normalized[i] !== word) continue

            if (i - cur <= 1) {
              // The immediate next word (or one skipped word) — accept
              // right away, no confirmation needed, no added latency.
              cur = i + 1
            } else {
              // A bigger jump — hold it pending confirmation from the next word.
              pendingCandidate = { index: i }
            }
            matched = true
            break
          }
        }

        if (matched) {
          staleWordCount = 0
        } else {
          staleWordCount++
          if (staleWordCount >= STALE_LIMIT && cur < normalized.length) {
            cur += 1
            staleWordCount = 0
          }
        }
      }

      if (cur !== cursorRef.current) {
        cursorRef.current = cur
        setCursor(cur)
      }
    }

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const resultWords = result[0].transcript.trim().split(/\s+/).map(normalize).filter(Boolean)
        const alreadyConsumed = consumedPerResult.get(i) ?? 0
        const newWords = resultWords.slice(alreadyConsumed)

        if (newWords.length) {
          advanceCursor(newWords)
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
      // sequence (indices restart from 0). Reset our per-session tracking
      // so stale slot counts from the old session don't mis-slice the new one.
      consumedPerResult = new Map()
      pendingCandidate = null
      staleWordCount = 0

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
