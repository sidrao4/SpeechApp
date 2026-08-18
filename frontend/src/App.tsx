import { useState } from 'react'
import { SetupScreen } from './components/SetupScreen'
import { Teleprompter } from './components/Teleprompter'

type Screen = 'setup' | 'prompter'

function App() {
  const [screen, setScreen] = useState<Screen>('setup')
  const [script, setScript] = useState('')

  if (screen === 'prompter') {
    return <Teleprompter script={script} onExit={() => setScreen('setup')} />
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
