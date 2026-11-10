/**
 * Ліниве завантаження частин застосунку (docx-preview, docxtemplater).
 * Після оновлення сайту відкрита вкладка посилається на старі файли, яких уже немає:
 * браузер пише «Importing a module script failed». Тоді один раз перезавантажуємо сторінку,
 * а якщо не допомогло — просимо користувача оновити її вручну.
 */
const FLAG = 'documents-chunk-reload'
const CHUNK_ERROR = /module script|dynamically imported module|Loading chunk|Failed to fetch dynamically/i

export const isChunkLoadError = (e: unknown): boolean => CHUNK_ERROR.test(e instanceof Error ? e.message : String(e))

export async function loadChunk<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load()
  } catch (e) {
    if (!isChunkLoadError(e)) throw e
    let alreadyTried: boolean
    try {
      const last = Number(sessionStorage.getItem(FLAG) ?? 0)
      alreadyTried = Date.now() - last < 60_000
      if (!alreadyTried) sessionStorage.setItem(FLAG, String(Date.now()))
    } catch {
      alreadyTried = true
    }
    if (!alreadyTried) {
      window.location.reload()
      return new Promise<T>(() => {}) // сторінка перезавантажується
    }
    throw new Error('Застосунок оновився. Оновіть сторінку (Ctrl+Shift+R, на телефоні — закрийте й відкрийте вкладку), потім повторіть.', { cause: e })
  }
}
