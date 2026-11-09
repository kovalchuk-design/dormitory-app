import { useState } from 'react'
import { GLOBAL_PLACEHOLDERS, placeholderSnippet, STUDENT_PLACEHOLDERS, studentSnippet } from './templating'

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setDone(true)
      setTimeout(() => setDone(false), 1500)
    } catch {
      window.prompt('Скопіюйте мітку (Ctrl+C):', text)
    }
  }
  return (
    <button type="button" className="secondary copy-btn" onClick={() => void copy()} title={`Скопіювати ${text}`}>
      {done ? 'Скопійовано ✓' : 'Копіювати'}
    </button>
  )
}

/** Довідка для тих, хто готує шаблони (адміністратор): що писати у Word і як воно заповнюється. */
export function TemplateHelp() {
  return (
    <details className="panel help">
      <summary><strong>Довідка: як підготувати шаблон</strong></summary>
      <ol className="help-steps">
        <li>Відкрийте звичайний документ у Word (наприклад, бланк заяви).</li>
        <li>Там, де має з’явитися дані учня чи дата, напишіть <strong>мітку у подвійних фігурних дужках</strong>, наприклад <code>{'{{student.full_name}}'}</code>. Скопіювати готову мітку можна кнопками нижче й вставити у Word (Ctrl+V).</li>
        <li>Збережіть файл як <strong>.docx</strong> і додайте його у «Додати шаблон». Програма перевірить, чи правильно написані мітки.</li>
        <li>Вихователь обирає шаблон і учнів — мітки автоматично замінюються на справжні дані. Вихователь самих міток не бачить.</li>
      </ol>
      <p className="muted small">Мітку пишіть <strong>без пробілів і в один прийом</strong> (не змінюйте шрифт посередині). Не вказане або порожнє поле просто стане порожнім місцем у готовому документі.</p>

      <h3>Загальні поля</h3>
      <table className="help-table">
        <tbody>
          {GLOBAL_PLACEHOLDERS.filter((p) => p.key !== 'students' && p.key !== 'student.*').map((p) => (
            <tr key={p.key}>
              <td><code>{placeholderSnippet(p.key)}</code></td>
              <td>{p.description}{p.example && <span className="muted"> — напр. {p.example}</span>}</td>
              <td><CopyButton text={placeholderSnippet(p.key)} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Документ на одного учня</h3>
      <p className="muted small">Якщо вибрано кількох учнів, береться перший. Для списків скористайтеся таблицею (нижче).</p>
      <table className="help-table">
        <tbody>
          {STUDENT_PLACEHOLDERS.filter((p) => p.key !== 'index').map((p) => (
            <tr key={p.key}>
              <td><code>{studentSnippet(p.key, 'single')}</code></td>
              <td>{p.description}{p.example && <span className="muted"> — напр. {p.example}</span>}</td>
              <td><CopyButton text={studentSnippet(p.key, 'single')} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Список учнів у таблиці (цілий поверх чи кімната)</h3>
      <p>Зробіть у Word таблицю з заголовком і <strong>одним рядком-зразком</strong>. У першу клітинку цього рядка додайте на початку <code>{'{{#students}}'}</code>, а в останню клітинку — наприкінці <code>{'{{/students}}'}</code>. Рядок повториться для кожного вибраного учня. Усередині рядка поля пишуться <strong>без «student.»</strong>:</p>
      <table className="help-table example">
        <thead><tr><th>№</th><th>ПІБ</th><th>Кімната</th></tr></thead>
        <tbody>
          <tr>
            <td><code>{'{{#students}}{{index}}'}</code></td>
            <td><code>{'{{full_name}}'}</code></td>
            <td><code>{'{{room}}{{/students}}'}</code></td>
          </tr>
        </tbody>
      </table>
      <div className="card-actions">
        <CopyButton text="{{#students}}" /> <span className="small">початок рядка</span>
        <CopyButton text="{{/students}}" /> <span className="small">кінець рядка</span>
        <CopyButton text="{{index}}" /> <span className="small">№ за порядком</span>
      </div>
      <p className="muted small">У списку можна використовувати ті самі поля, що й для одного учня: {STUDENT_PLACEHOLDERS.filter((p) => p.key !== 'index').map((p) => studentSnippet(p.key, 'row')).join(', ')}.</p>
    </details>
  )
}
