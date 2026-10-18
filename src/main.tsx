import { Component, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import SetupScreen from './SetupScreen.tsx'
import { isSupabaseConfigured } from './lib/supabase'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{ maxWidth: 560, margin: '12vh auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <h2>Что-то пошло не так</h2>
        <p>Приложение столкнулось с ошибкой. Попробуйте обновить страницу.</p>
        <pre style={{ whiteSpace: 'pre-wrap', background: '#f4f4f4', padding: 12, borderRadius: 8, color: '#a00' }}>
          {this.state.error.message}
        </pre>
        <button onClick={() => location.reload()}>Обновить</button>
      </div>
    )
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {isSupabaseConfigured ? <App /> : <SetupScreen />}
    </ErrorBoundary>
  </StrictMode>,
)
