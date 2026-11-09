import { useParams } from 'react-router-dom'

/** Публічна анкета студента (без входу й навігації). */
export function StudentFormPage() {
  const { token } = useParams<{ token: string }>()
  return (
    <div className="fullscreen">
      <div className="card">
        <h1>Анкета студента</h1>
        <p className="muted">Форма у розробці.</p>
        <p className="muted small">Код: {token}</p>
      </div>
    </div>
  )
}
