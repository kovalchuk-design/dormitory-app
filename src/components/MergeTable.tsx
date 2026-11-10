import type { FieldDiff } from '../lib/diff'
import { defaultChoice, MERGEABLE, mergedValue, type Choice } from '../lib/mergeChoice'

interface Props {
  rows: FieldDiff[]
  title: string
  onlyChanged: boolean
  choices: Record<string, Choice>
  edits: Record<string, string>
  onToggle: (row: FieldDiff, side: 'old' | 'new') => void
  onEdit: (row: FieldDiff, value: string) => void
}

/**
 * Порівняння чинної й нової версії з вибором галочками: у кожного зміненого поля можна залишити стару відповідь,
 * нову або обидві (тоді запишеться «стара, нова»). Невибране значення приглушене, справа — що буде записано.
 */
export function MergeTable({ rows, title, onlyChanged, choices, edits, onToggle, onEdit }: Props) {
  const shown = onlyChanged ? rows.filter((r) => r.changed) : rows
  return (
    <div className="table-wrap">
      <table className="data diff merge">
        <colgroup><col className="c-field" /><col className="c-old" /><col className="c-new" /><col className="c-res" /></colgroup>
        <caption className="sr-only">{title}</caption>
        <thead>
          <tr>
            <th scope="col">Поле</th>
            <th scope="col">Чинна версія</th>
            <th scope="col">Нова версія</th>
            <th scope="col">Буде записано <span className="muted">(можна виправити)</span></th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            if (!r.changed) {
              return (
                <tr key={r.key}>
                  <th scope="row">{r.label}</th>
                  <td data-label="Чинна">{r.before || <span className="muted">—</span>}</td>
                  <td data-label="Нова">{r.after || <span className="muted">—</span>}</td>
                  <td data-label="Буде записано">{r.after || <span className="muted">—</span>}</td>
                </tr>
              )
            }
            const c = choices[r.key] ?? defaultChoice(r.before, r.after)
            const merged = mergedValue(r.before, r.after, c)
            const result = edits[r.key] ?? merged
            const edited = edits[r.key] !== undefined && edits[r.key].replace(/\s+/g, ' ').trim() !== merged
            const hint = MERGEABLE.has(r.key) ? 'можна обрати обидва' : 'лише одне значення'
            const cell = (side: 'old' | 'new', value: string) => (
              <label className={`pick ${c[side] ? 'on' : 'off'}`}>
                <input
                  type="checkbox" checked={c[side]} disabled={!value.trim()}
                  aria-label={`${r.label}: ${side === 'old' ? 'залишити стару' : 'взяти нову'} відповідь (${hint})`}
                  onChange={() => onToggle(r, side)}
                />
                <span>{value || '—'}</span>
              </label>
            )
            return (
              <tr key={r.key} className="changed">
                <th scope="row">{r.label}<span className="sr-only"> (змінено)</span></th>
                <td data-label="Чинна">{cell('old', r.before)}</td>
                <td data-label="Нова">{cell('new', r.after)}</td>
                <td data-label="Буде записано" className={`merge-result${edited ? ' edited' : ''}`}>
                  <textarea
                    rows={Math.min(6, Math.max(1, Math.ceil(result.length / 28)))} value={result}
                    aria-label={`${r.label}: підсумкове значення, можна виправити вручну`}
                    onChange={(e) => onEdit(r, e.target.value)}
                  />
                  {edited && <span className="small muted">виправлено вручну</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
