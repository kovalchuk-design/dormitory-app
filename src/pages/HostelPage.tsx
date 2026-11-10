import { useCallback, useRef, useState } from 'react'
import { Navigate, NavLink, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { ActionMenu, type ActionItem } from '../components/ui/ActionMenu'
import { Drawer } from '../components/ui/Drawer'
import { RoomsPage } from '../features/rooms/RoomsPage'
import { downloadCsv } from '../lib/csv'
import { errorMessage } from '../lib/format'
import { fetchStudentRows } from '../lib/studentsApi'
import { studentsToCsv, type StudentRow } from '../lib/studentsList'
import { HostelExportRegistry, HostelNewRoom, HostelStudentCard } from './hostelContext'
import { StudentCardPage } from './StudentCardPage'
import { StudentsPage } from './StudentsPage'

/** «Гуртожиток»: одна сторінка з перемикачем виду — Студенти / Кімнати. Кнопки в шапці однакові в обох видах. */
export function HostelPage() {
  const { view } = useParams<{ view: string }>()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const canEdit = profile?.role === 'admin' || profile?.role === 'educator'
  const isAdmin = profile?.role === 'admin'
  const getRows = useRef<(() => StudentRow[]) | null>(null)
  const register = useCallback((fn: (() => StudentRow[]) | null) => { getRows.current = fn }, [])
  const [creating, setCreating] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const addItems: ActionItem[] = [
    ...(canEdit ? [{ label: 'Учня', to: '/students/new' }] : []),
    ...(isAdmin ? [{ label: 'Кімнату', onClick: () => { setCreating(true); if (view !== 'rooms') navigate('/hostel/rooms') } }] : []),
  ]

  if (view !== 'students' && view !== 'rooms') return <Navigate to="/hostel/students" replace />

  // У виді «Студенти» вивантажуємо поточний (відфільтрований) список, у виді «Кімнати» — усіх учнів.
  async function exportCsv() {
    setExportError(null)
    setExporting(true)
    try {
      const rows = getRows.current ? getRows.current() : await fetchStudentRows()
      downloadCsv(`students-${new Date().toISOString().slice(0, 10)}.csv`, studentsToCsv(rows))
    } catch (e) {
      setExportError(errorMessage(e))
    } finally {
      setExporting(false)
    }
  }

  return (
    <section className="fill-page hostel">
      <div className="hostel-head">
        <h1>Гуртожиток</h1>
        <nav className="view-switch" aria-label="Вигляд">
          <NavLink to="/hostel/students" replace>Студенти</NavLink>
          <NavLink to="/hostel/rooms" replace>Кімнати</NavLink>
        </nav>
        <div className="hostel-actions">
          {exportError && <span className="error" role="alert">{exportError}</span>}
          <button type="button" className="secondary" disabled={exporting} onClick={() => void exportCsv()}>Експорт CSV</button>
          <ActionMenu label="+ Додати" items={addItems} />
        </div>
      </div>
      <HostelExportRegistry.Provider value={register}>
        <HostelNewRoom.Provider value={{ creating, setCreating }}>
          <HostelStudentCard.Provider value={{ openId, open: setOpenId }}>
            <div className="hostel-view">{view === 'rooms' ? <RoomsPage /> : <StudentsPage />}</div>
            {openId && (
              <Drawer label="Картка учня" onClose={() => setOpenId(null)}>
                <StudentCardPage studentId={openId} embedded />
              </Drawer>
            )}
          </HostelStudentCard.Provider>
        </HostelNewRoom.Provider>
      </HostelExportRegistry.Provider>
    </section>
  )
}
