/** Прогрес заповнення анкети: «Заповнено N з M обовʼязкових полів». Лише презентація, нічого не валідує. */
export function FormProgress({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  return (
    <div className="form-progress">
      <div className="form-progress-text" aria-live="polite">
        <strong>{done === total ? 'Усе заповнено' : `Заповнено ${done} з ${total}`}</strong>
        <span>{done === total ? 'залишилось надіслати' : 'обовʼязкових пунктів'}</span>
      </div>
      <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Прогрес заповнення анкети">
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
