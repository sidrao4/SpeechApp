import { useEffect, useRef, useState } from 'react'
import { alignRecentSpeech } from '../lib/alignRecentSpeech'

// how many recent words we keep around for the fuzzy matcher
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

    // chrome keeps re-firing onresult for the same phrase as it refines its
    // guess ("the" -> "the quick" -> "the quick brown"...), so we track how
    // much of each slot we've already used and only feed in the new part
    let consumedPerResult = new Map<number, number>()

    let recentSpoken: string[] = []

    function advanceTo(position: number) {
      cursorRef.current = position
      setCursor(position)
      // clear the buffer once we're confident again, old words in there
      // can throw off the next match
      recentSpoken = []
    }

    function onNewWord(word: string) {
      const cur = cursorRef.current

      // if it's exactly the word we expect next, just take it, no need to
      // run it through the matcher
      if (cur < normalized.length && word === normalized[cur]) {
        advanceTo(cur + 1)
        return
      }
      if (cur + 1 < normalized.length && word === normalized[cur + 1]) {
        advanceTo(cur + 2)
        return
      }

      // something's off (misheard, skipped, whatever) - try to realign.
      // if nothing lines up we just sit still. better to wait than guess
      // and jump to the wrong spot if someone goes off script for a bit
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
      // recognition randomly stops itself after a pause even with
      // continuous on, and restarting it means the result indices reset to
      // 0, so wipe our tracking or the next session gets sliced wrong
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
