import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <section>
      <h1>Сторінку не знайдено</h1>
      <Link to="/">На головну</Link>
    </section>
  )
}
