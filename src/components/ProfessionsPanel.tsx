import { useMemo, useState, type FormEvent } from 'react'
import { errorMessage } from '../lib/format'
import { nextSortOrder, suggestProfessions } from '../lib/professions'
import { supabase } from '../lib/supabase'
import { useLoad } from '../lib/useLoad'
import { Icon } from './ui/icons'

/**
 * Перелік професій для публічної анкети (радіокнопки). Лише адміністратор: додає, перейменовує, ховає, видаляє.
 * Збережені відповіді учнів не змінюються — в анкеті лишається текст, який обрали.
 */
export function ProfessionsPanel() {
  const { data, error, loading, reload } = useLoad(async () => {
    const [list, used] = await Promise.all([
      supabase.from('professions').select('id,name,sort_order,is_active').order('sort_order').order('name'),
      supabase.from('student_profiles').select('profession').in('status', ['approved', 'pending']).limit(5000),
    ])
    if (list.error) throw list.error
    if (used.error) throw used.error
    return { list: list.data, used: used.data }
  }, 'professions')
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const suggestions = useMemo(() => (data ? suggestProfessions(data.used, data.list.map((p) => p.name)) : []), [data])

  async function run(op: () => PromiseLike<{ error: unknown }>) {
    setBusy(true); setMsg(null)
    const { error: err } = await op()
    setBusy(false)
    if (err) {
      const text = errorMessage(err)
      return setMsg(/duplicate|unique/i.test(text) ? 'Така професія вже є в переліку.' : text)
    }
    reload()
  }

  const add = (value: string) =>
    run(() => supabase.from('professions').insert({ name: value.trim(), sort_order: nextSortOrder(data?.list ?? []) }))

  async function onAdd(e: FormEvent) {
    e.preventDefault()
    if (name.trim().length < 2) return setMsg('Введіть назву професії.')
    await add(name)
    setName('')
  }

  return (
    <section className="panel" aria-labelledby="prof-h">
      <h2 id="prof-h">Професії для анкети</h2>
      <p className="muted small">
        Учні обирають професію зі списку (або «Інша» й пишуть свою). Тут ви ведете цей список: додаєте, виправляєте назву або ховаєте професію від учнів.
        Уже збережені анкети не змінюються.
      </p>
      {loading && <p className="muted">Завантаження…</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {msg && <p className="error" role="alert">{msg}</p>}
      {data && (
        <>
          <ul className="plain prof-list">
            {data.list.map((p) => {
              const ed = editing && editing.id === p.id ? editing : null
              return (
              <li key={p.id} className={`prof-row${p.is_active ? '' : ' off'}`}>
                {ed ? (
                  <form className="row grow" onSubmit={(e) => { e.preventDefault(); void run(() => supabase.from('professions').update({ name: ed.name.trim() }).eq('id', p.id)).then(() => setEditing(null)) }}>
                    <input aria-label="Назва професії" value={ed.name} onChange={(e) => setEditing({ id: p.id, name: e.target.value })} maxLength={200} autoFocus />
                    <button type="submit" disabled={busy || ed.name.trim().length < 2}>Зберегти</button>
                    <button type="button" className="secondary" onClick={() => setEditing(null)}>Скасувати</button>
                  </form>
                ) : (
                  <>
                    <label className="check grow">
                      <input type="checkbox" checked={p.is_active} disabled={busy} onChange={(e) => void run(() => supabase.from('professions').update({ is_active: e.target.checked }).eq('id', p.id))} />
                      <span>{p.name}{!p.is_active && <span className="muted small"> (прихована від учнів)</span>}</span>
                    </label>
                    <button type="button" className="iconbtn" aria-label={`Змінити назву: ${p.name}`} title="Змінити назву" onClick={() => setEditing({ id: p.id, name: p.name })}><Icon name="edit" /></button>
                    <button type="button" className="iconbtn" aria-label={`Видалити: ${p.name}`} title="Видалити зі списку" disabled={busy}
                      onClick={() => { if (window.confirm(`Видалити «${p.name}» зі списку? Анкети, де її вже обрано, не зміняться.`)) void run(() => supabase.from('professions').delete().eq('id', p.id)) }}><Icon name="close" /></button>
                  </>
                )}
              </li>
              )
            })}
            {data.list.length === 0 && <li className="muted">Список порожній: учні вводитимуть професію текстом.</li>}
          </ul>
          <form className="row" onSubmit={(e) => void onAdd(e)}>
            <label className="grow">Нова професія
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} placeholder="Повна назва професії" />
            </label>
            <button type="submit" disabled={busy}>Додати</button>
          </form>
          {suggestions.length > 0 && (
            <details>
              <summary>Вводили учні, але немає в списку ({suggestions.length})</summary>
              <p className="muted small">Різні написання однієї професії можна не додавати — просто додайте правильну назву зверху.</p>
              <ul className="plain">
                {suggestions.map((s) => (
                  <li key={s.name} className="candidate">
                    <span>{s.name} <span className="muted small">· {s.count}</span></span>
                    <button type="button" className="secondary" disabled={busy} onClick={() => void add(s.name)}>Додати в список</button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  )
}
