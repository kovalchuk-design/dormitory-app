function Placeholder({ title }: { title: string }) {
  return (
    <section>
      <h1>{title}</h1>
      <p className="muted">Розділ у розробці.</p>
    </section>
  )
}

export const HomePage = () => <Placeholder title="Головна" />
export const StudentsPage = () => <Placeholder title="Студенти" />
export const RoomsPage = () => <Placeholder title="Кімнати" />
export const DocumentsPage = () => <Placeholder title="Документи" />
export const EventsPage = () => <Placeholder title="Івенти" />
export const CalendarPage = () => <Placeholder title="Календар" />
export const AdminPage = () => <Placeholder title="Адміністрування" />
