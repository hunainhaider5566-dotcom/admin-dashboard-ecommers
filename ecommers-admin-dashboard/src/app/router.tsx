import { Navigate, Route, Routes } from 'react-router-dom'
import { AdminPage } from '../pages/AdminPages'
import { AdminLogin } from '../pages/auth/AdminLogin'
import { AdminMfa } from '../pages/auth/AdminMfa'
import { AdminEmailOtp } from '../pages/auth/AdminEmailOtp'

export function AppRouter() {
  return <Routes><Route path="/login" element={<AdminLogin />} /><Route path="/admin-email-otp" element={<AdminEmailOtp />} /><Route path="/admin-mfa" element={<AdminMfa />} /><Route path="/admin/*" element={<AdminPage />} /><Route path="*" element={<Navigate to="/admin" replace />} /></Routes>
}
