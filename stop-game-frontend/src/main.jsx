import { StrictMode as _StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import _App from './App.jsx'
import './index.css'  // Importa o Tailwind aqui

ReactDOM.createRoot(document.getElementById('root')).render(
  <_StrictMode>
    <_App />
  </_StrictMode>,
)