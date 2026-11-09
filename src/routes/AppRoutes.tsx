import { Route, Routes } from 'react-router-dom'
import { RequireAuth } from '../auth/RequireAuth'
import { RequireRole } from '../auth/RequireRole'
import { Layout } from '../components/Layout'
import { LoginPage } from '../pages/LoginPage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { ApprovalsPage } from '../pages/ApprovalsPage'
import { StudentCardPage } from '../pages/StudentCardPage'
import { StudentEditPage } from '../pages/StudentEditPage'
import { StudentFormPage } from '../pages/StudentFormPage'
import { StudentsPage } from '../pages/StudentsPage'
import {
  AdminPage,
  CalendarPage,
  DocumentsPage,
  EventsPage,
  HomePage,
  RoomsPage,
} from '../pages/placeholders'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/form/:token" element={<StudentFormPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="students" element={<StudentsPage />} />
          <Route path="students/new" element={<StudentEditPage />} />
          <Route path="students/:id" element={<StudentCardPage />} />
          <Route path="students/:id/edit" element={<StudentEditPage />} />
          <Route
            path="updates"
            element={
              <RequireRole roles={['admin', 'educator']}>
                <ApprovalsPage />
              </RequireRole>
            }
          />
          <Route path="rooms" element={<RoomsPage />} />
          <Route path="documents" element={<DocumentsPage />} />
          <Route path="events" element={<EventsPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route
            path="admin"
            element={
              <RequireRole roles={['admin']}>
                <AdminPage />
              </RequireRole>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  )
}
