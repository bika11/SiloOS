import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/amokka/styles.css' // Amokka design tokens + Mabry Pro (SiloOS Console)
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
