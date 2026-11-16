import { useEffect, useState } from 'react'
import { PhoneLink } from '../../components/PhoneLink'
import { Modal } from '../documents/PreviewModal'
import { fetchContacts, type ContactRow } from './api'
import { pupilFullName, type Pupil } from '../rooms/logic'

/** Контакти учня (телефони) у вікні: відкривається клацанням по імені у звіті «Обхід». */
export function ContactsModal({ pupil, room, onClose }: { pupil: Pupil; room: string; onClose: () => void }) {
  const [rows, setRows] = useState<ContactRow[] | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void fetchContacts(pupil.id).then((r) => { if (!alive) return; setRows(r.rows); setError(r.error) })
    return () => { alive = false }
  }, [pupil.id])
  return (
    <Modal title={`${pupilFullName(pupil)} · кімната ${room}`} narrow onClose={onClose}>
      {rows === undefined && <p className="muted">Завантаження…</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {rows === null && !error && <p className="muted">Затвердженої анкети ще немає — контактів немає.</p>}
      {rows && rows.length === 0 && <p className="muted">Контактів в анкеті немає.</p>}
      {rows && rows.length > 0 && (
        <table className="contacts-table">
          <thead className="sr-only"><tr><th scope="col">Хто</th><th scope="col">Телефон</th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.label}>
                <th scope="row">{c.label}{c.name && <span className="ct-name">{c.name}</span>}</th>
                <td className="ct-phone"><PhoneLink phone={c.phone} label={`${c.label} ${c.name ?? ''}`} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  )
}
