import { useEffect, useRef, useState } from 'react'

// How far ahead of the current word we'll search for a match. Keeps a
// misheard word from making the cursor jump to some unrelated later
// occurrence of a common word (e.g. "the") elsewhere in the script.
const LOOKAHEAD = 8

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

    recognition.onresult = (event) => {
      let transcript = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += ' ' + event.results[i][0].transcript
      }
      const spoken = transcript.trim().split(/\s+/).map(normalize).filter(Boolean)
      if (!spoken.length) return

      let cur = cursorRef.current
      for (const word of spoken) {
        const windowEnd = Math.min(cur + LOOKAHEAD, normalized.length)
        for (let i = cur; i < windowEnd; i++) {
          if (normalized[i] === word) {
            cur = i + 1
            break
          }
        }
      }

      if (cur !== cursorRef.current) {
        cursorRef.current = cur
        setCursor(cur)
      }
    }

    recognition.onerror = () => {
      setError('Mic access was denied or unavailable — allow microphone permission and reload.')
      setListening(false)
    }

    recognition.onend = () => {
      // The browser stops recognition after a pause in speech even with
      // continuous=true. Auto-restart until the script is finished.
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
