import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from '../auth/RequireAuth'
import { RequireRole } from '../auth/RequireRole'
import { Layout } from '../components/Layout'
import { LoginPage } from '../pages/LoginPage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { FormsPage } from '../pages/FormsPage'
import { StudentCardPage } from '../pages/StudentCardPage'
import { StudentEditPage } from '../pages/StudentEditPage'
import { StudentFormPage } from '../pages/StudentFormPage'
import { HostelPage } from '../pages/HostelPage'
import { AdminDocumentSettings, DocumentsPage } from '../features/documents'
import { AdminUsersPage } from '../features/admin-users'
import {
  AdminPage,
  CalendarPage,
  EventsPage,
} from '../pages/placeholders'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/form/:token" element={<StudentFormPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/hostel/rooms" replace />} />
          <Route path="hostel" element={<Navigate to="/hostel/rooms" replace />} />
          <Route path="hostel/:view" element={<HostelPage />} />
          <Route path="students" element={<Navigate to="/hostel/students" replace />} />
          <Route path="students/new" element={<StudentEditPage />} />
          <Route path="students/:id" element={<StudentCardPage />} />
          <Route path="students/:id/edit" element={<StudentEditPage />} />
          <Route path="forms" element={<Navigate to="/forms/collect" replace />} />
          <Route
            path="forms/:view"
            element={
              <RequireRole roles={['admin']}>
                <FormsPage />
              </RequireRole>
            }
          />
          <Route path="updates" element={<Navigate to="/forms/updates" replace />} />
          <Route path="collect" element={<Navigate to="/forms/collect" replace />} />
          <Route path="rooms" element={<Navigate to="/hostel/rooms" replace />} />
          <Route path="documents" element={<DocumentsPage />} />
          <Route path="password" element={<Navigate to="/hostel/rooms" replace />} />
          <Route path="events" element={<RequireRole roles={['admin', 'staff_readonly']}><EventsPage /></RequireRole>} />
          <Route path="calendar" element={<RequireRole roles={['admin', 'staff_readonly']}><CalendarPage /></RequireRole>} />
          <Route
            path="admin"
            element={
              <RequireRole roles={['admin']}>
                <AdminPage />
                <AdminUsersPage />
                <AdminDocumentSettings />
              </RequireRole>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  )
}
