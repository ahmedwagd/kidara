import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { App } from './App'

const container = document.getElementById('root')
if (container === null) throw new Error('Root element #root is missing')
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
