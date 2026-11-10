import { useState } from 'react'
import { Link, Navigate, NavLink, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { RoomsPage } from '../features/rooms/RoomsPage'
import { HostelActionsSlot } from './hostelContext'
import { StudentsPage } from './StudentsPage'

/** «Гуртожиток»: одна сторінка з перемикачем виду — Студенти / Кімнати. */
export function HostelPage() {
  const { view } = useParams<{ view: string }>()
  const { profile } = useAuth()
  const canEdit = profile?.role === 'admin' || profile?.role === 'educator'
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  if (view !== 'students' && view !== 'rooms') return <Navigate to="/hostel/students" replace />
  return (
    <section className="fill-page hostel">
      <div className="hostel-head">
        <h1>Гуртожиток</h1>
        <nav className="view-switch" aria-label="Вигляд">
          <NavLink to="/hostel/students" replace>Студенти</NavLink>
          <NavLink to="/hostel/rooms" replace>Кімнати</NavLink>
        </nav>
        <div className="hostel-actions">
          <span className="hostel-actions-slot" ref={setSlot} />
          {canEdit && <Link className="btn" to="/students/new">+ Додати учня</Link>}
        </div>
      </div>
      <HostelActionsSlot.Provider value={slot}>
        <div className="hostel-view">{view === 'rooms' ? <RoomsPage /> : <StudentsPage />}</div>
      </HostelActionsSlot.Provider>
    </section>
  )
}
