import { init } from '@noriginmedia/norigin-spatial-navigation'
import { createRoot } from 'react-dom/client'
import App from './App'
import { recoverFocus } from './nav/focus'
import { registerTvKeys } from './nav/keys'
import './theme.css'

init({ throttle: 80, throttleKeypresses: true })
registerTvKeys()
window.addEventListener('keydown', recoverFocus, true)
createRoot(document.getElementById('root')!).render(<App />)
