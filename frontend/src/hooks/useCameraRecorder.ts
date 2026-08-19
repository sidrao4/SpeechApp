import { useCallback, useEffect, useRef, useState } from 'react'

type Status = 'starting' | 'live' | 'stopped' | 'unavailable'

// live camera preview + local recording. never leaves the browser - the
// clip is just an in-memory blob url for playback and downloading, gets
// tossed when the component unmounts.
//
// known bug: the playback element renders black in-browser even though the
// recording itself is fine (downloads fine, real data, plays elsewhere).
// spent a while trying to fix it, no luck yet, not chasing it further right
// now since the download still works
export function useCameraRecorder() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState<Status>('starting')
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null)
  const [recordedType, setRecordedType] = useState('video/webm')

  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  useEffect(() => {
    let cancelled = false

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        setStatus('unavailable')
        return
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }

        const recorder = new MediaRecorder(stream)
        chunksRef.current = []
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunksRef.current.push(event.data)
        }
        recorder.start(1000)
        recorderRef.current = recorder
        setStatus('live')
      } catch {
        setStatus('unavailable')
      }
    }

    start()

    return () => {
      cancelled = true
      recorderRef.current?.stop()
      streamRef.current?.getTracks().forEach((track) => track.stop())
      setRecordedUrl((url) => {
        if (url) URL.revokeObjectURL(url)
        return null
      })
    }
  }, [])

  const stop = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') return

    recorder.onstop = () => {
      // use whatever mimeType the recorder actually picked, not a guess
      const type = recorder.mimeType || 'video/webm'
      const blob = new Blob(chunksRef.current, { type })
      setRecordedType(type)
      setRecordedUrl(URL.createObjectURL(blob))
      setStatus('stopped')
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
    recorder.stop()
  }, [])

  return { videoRef, status, recordedUrl, recordedType, stop }
}
