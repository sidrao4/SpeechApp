import { useState } from 'react'
import { SetupScreen } from './components/SetupScreen'
import { Teleprompter } from './components/Teleprompter'

type Screen = 'setup' | 'prompter'

function App() {
  const [screen, setScreen] = useState<Screen>('setup')
  const [script, setScript] = useState('')
  // Bumping this remounts Teleprompter from scratch — fresh cursor, fresh
  // mic session, fresh matching state — which is the cleanest way to
  // fully reset it on restart.
  const [attempt, setAttempt] = useState(0)

  if (screen === 'prompter') {
    return (
      <Teleprompter
        key={attempt}
        script={script}
        onExit={() => setScreen('setup')}
        onRestart={() => setAttempt((a) => a + 1)}
      />
    )
  }

  return (
    <SetupScreen
      onStart={(text) => {
        setScript(text)
        setScreen('prompter')
      }}
    />
  )
}

export default App
