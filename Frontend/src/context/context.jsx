import React from 'react'
import { useContext, useState, createContext } from 'react'

export const AppContext = createContext()

export const AppProvider = ({ children }) => {
  const [user, setUser] = useState(null)

  return (
    <AppContext.Provider value={{ user, setUser }}>
      {children}
    </AppContext.Provider>
  )
}

export const useAppContext = () => {
  const ctx = useContext(AppContext)
  if (!ctx) {
    // helpful error for developers
    throw new Error('useAppContext must be used within an AppProvider')
  }
  return ctx
}
