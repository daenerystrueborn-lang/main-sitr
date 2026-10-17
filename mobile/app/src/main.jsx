import React from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource-variable/space-grotesk'
import './styles.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(<App />)
// Lift the splash once React has painted.
requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById('splash')?.remove()))
