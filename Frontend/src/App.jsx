import './App.css'
import AppRoutes from './routes/AppRoutes'
import { AppProvider } from './context/context'

function App() {
  return (
    <AppProvider>
      <AppRoutes />
    </AppProvider>
  )
}

export default App
