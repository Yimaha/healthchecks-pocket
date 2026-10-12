import { Capacitor } from '@capacitor/core'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './ui/App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Offline app shell for the installed web app. Native wrappers (Capacitor)
// bundle the files themselves, and dev mode shouldn't cache anything.
if ('serviceWorker' in navigator) {
  if (Capacitor.isNativePlatform()) {
    // The app ships its files itself; make sure no web service worker lingers.
    void navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()))
  } else if (import.meta.env.PROD && location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  }
}
