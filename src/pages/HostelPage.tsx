import { useState } from 'react'
import { Navigate, NavLink, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { ActionMenu, type ActionItem } from '../components/ui/ActionMenu'
import { Drawer } from '../components/ui/Drawer'
import { RoomsPage } from '../features/rooms/RoomsPage'
import { HostelNewRoom, HostelStudentCard } from './hostelContext'
import { StudentCardPage } from './StudentCardPage'
import { StudentsPage } from './StudentsPage'
import { useIsMobile } from '../features/students-list/logic'

/** «Гуртожиток»: одна сторінка з перемикачем виду — Студенти / Кімнати. Кнопки в шапці однакові в обох видах. */
export function HostelPage() {
  const { view } = useParams<{ view: string }>()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const canEdit = profile?.role === 'admin' || profile?.role === 'educator'
  const isAdmin = profile?.role === 'admin'
  const [creating, setCreating] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  const addItems: ActionItem[] = [
    ...(canEdit ? [{ label: 'Учня', to: '/students/new' }] : []),
    ...(isAdmin ? [{ label: 'Кімнату', onClick: () => { setCreating(true); if (view !== 'rooms') navigate('/hostel/rooms') } }] : []),
  ]

  if (view !== 'students' && view !== 'rooms') return <Navigate to="/hostel/rooms" replace />

  return (
    <section className="fill-page hostel">
      <div className="hostel-head">
        <h1 className="hostel-title">Гуртожиток</h1>
        <nav className="view-switch" aria-label="Вигляд">
          <NavLink to="/hostel/rooms" replace>Кімнати</NavLink>
          <NavLink to="/hostel/students" replace>Студенти</NavLink>
        </nav>
        <div className="hostel-actions">
          <ActionMenu label="+ Додати" items={addItems} compact={isMobile} />
        </div>
      </div>
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
    </section>
  )
}
