function Placeholder({ title }: { title: string }) {
  return (
    <section>
      <h1>{title}</h1>
      <p className="muted">Розділ у розробці.</p>
    </section>
  )
}

export const EventsPage = () => <Placeholder title="Івенти" />
export const CalendarPage = () => <Placeholder title="Календар" />
export const AdminPage = () => <Placeholder title="Адміністрування" />
