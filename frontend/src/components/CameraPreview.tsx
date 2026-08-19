import { useEffect } from 'react'
import { useCameraRecorder } from '../hooks/useCameraRecorder'

interface Props {
  finished: boolean
}

function extensionFor(mimeType: string): string {
  if (mimeType.includes('mp4')) return 'mp4'
  return 'webm'
}

export function CameraPreview({ finished }: Props) {
  const { videoRef, status, recordedUrl, recordedType, stop } = useCameraRecorder()

  useEffect(() => {
    if (finished) stop()
  }, [finished, stop])

  if (status === 'unavailable') return null

  return (
    <div className="absolute bottom-6 right-6 z-10 w-96 overflow-hidden rounded-lg border border-neutral-700 bg-neutral-800 shadow-lg">
      <div className="relative aspect-video">
        {status === 'stopped' && recordedUrl ? (
          <video src={recordedUrl} controls className="h-full w-full bg-black object-cover" />
        ) : (
          <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
        )}
        {status === 'starting' && (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-800 text-xs text-neutral-500">
            starting camera...
          </div>
        )}
      </div>

      {status === 'stopped' && recordedUrl && (
        <a
          href={recordedUrl}
          download={`practice-recording.${extensionFor(recordedType)}`}
          className="block w-full bg-neutral-700 px-3 py-2 text-center text-sm text-neutral-100 transition hover:bg-neutral-600"
        >
          save video to device
        </a>
      )}
    </div>
  )
}
