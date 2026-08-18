
import { useEffect, useRef, useState } from 'react'
import { alignRecentSpeech } from '../lib/alignRecentSpeech'

// How many recently-heard words we keep as context for alignment.
const RECENT_BUFFER_SIZE = 8

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

    function advanceTo(position: number) {
      cursorRef.current = position
      setCursor(position)
      // The buffer's only job is resolving uncertainty. Once we're
      // confident again, clear it — otherwise stale words from behind
      // the new cursor can wrongly influence the next alignment.
      recentSpoken = []
    }

    function onNewWord(word: string) {
      const cur = cursorRef.current

      // Fast path: the word you'd expect next while reading normally,
      // checked directly with no search — can't be thrown off by a
      // repeated word elsewhere in the script the way a window search
      // could. This is what makes normal-pace reading feel instant.
      if (cur < normalized.length && word === normalized[cur]) {
        advanceTo(cur + 1)
        return
      }
      if (cur + 1 < normalized.length && word === normalized[cur + 1]) {
        advanceTo(cur + 2)
        return
      }

      // Otherwise something's uncertain (misheard word, skip, or a
      // bigger jump) — fall back to alignment over recent context. If
      // nothing aligns at all, we deliberately just wait rather than
      // guessing forward: going off-script (ad-libbing, a tangent, then
      // picking the script back up) should pause the cursor in place,
      // not force it ahead through text you never said.
      recentSpoken = [...recentSpoken, word].slice(-RECENT_BUFFER_SIZE)
      const aligned = alignRecentSpeech(recentSpoken, normalized, cur)

      if (aligned !== null && aligned > cur) {
        advanceTo(aligned)
      }
    }

    function onNewWords(newWords: string[]) {
      for (const word of newWords) {
        onNewWord(word)
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
