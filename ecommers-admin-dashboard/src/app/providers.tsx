import type { ReactNode } from 'react'
import { AuthProvider } from '../contexts/AuthContext'
import { MfaGate } from '../components/MfaGate'
import { ToastProvider } from '../contexts/ToastContext'

export function AppProviders({ children }: { children: ReactNode }) {
  return <AuthProvider><ToastProvider><MfaGate>{children}</MfaGate></ToastProvider></AuthProvider>
}
