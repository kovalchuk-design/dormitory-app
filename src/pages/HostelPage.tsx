import { useState } from 'react'
import { Navigate, NavLink, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { ActionMenu, type ActionItem } from '../components/ui/ActionMenu'
import { Drawer } from '../components/ui/Drawer'
import { Modal } from '../features/documents/PreviewModal'
import { NewRoomHost, RoomsPage } from '../features/rooms/RoomsPage'
import { HostelNewRoom, HostelStudentCard } from './hostelContext'
import { StudentEditPage } from './StudentEditPage'
import { StudentCardPage } from './StudentCardPage'
import { StudentsPage } from './StudentsPage'
import { useIsMobile } from '../features/students-list/logic'

/** «Гуртожиток»: одна сторінка з перемикачем виду — Студенти / Кімнати. Кнопки в шапці однакові в обох видах. */
export function HostelPage() {
  const { view } = useParams<{ view: string }>()
  const { profile } = useAuth()
  const isMobile = useIsMobile()
  const canEdit = profile?.role === 'admin' || profile?.role === 'educator'
  const isAdmin = profile?.role === 'admin'
  const [creating, setCreating] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [addingStudent, setAddingStudent] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const addItems: ActionItem[] = [
    ...(canEdit ? [{ label: 'Учня', onClick: () => setAddingStudent(true) }] : []),
    ...(isAdmin ? [{ label: 'Кімнату', onClick: () => setCreating(true) }] : []),
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
        {/* На телефоні кнопку «+ Додати» прибрано (рішення власника): додавання учнів/кімнат — з десктопної версії */}
        {!isMobile && <div className="hostel-actions">
          <ActionMenu label="+ Додати" items={addItems} />
        </div>}
      </div>
        <HostelNewRoom.Provider value={{ creating, setCreating }}>
          <HostelStudentCard.Provider value={{ openId, open: setOpenId }}>
            <div className="hostel-view" key={reloadKey}>{view === 'rooms' ? <RoomsPage /> : <StudentsPage />}</div>
            {view === 'students' && <NewRoomHost />}
            {addingStudent && (
              <Modal title="Новий учень" onClose={() => setAddingStudent(false)}>
                <StudentEditPage embedded={{ onClose: () => setAddingStudent(false), onCreated: (id) => { setAddingStudent(false); setReloadKey((k) => k + 1); setOpenId(id) } }} />
              </Modal>
            )}
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
