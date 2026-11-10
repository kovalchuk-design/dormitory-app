import { supabase } from '../../lib/supabase'
import { downloadName, extensionOf, mimeForType, newStoragePath } from './filters'
import type { StudentSource } from './templating'
import type { AcademicYear, Author, DocumentRow, FileType, TemplateRow } from './types'

const BUCKET = 'documents'
const DOC_COLUMNS =
  'id,title,category,topic,academic_year_id,author_id,tags,storage_path,mime_type,based_on_document_id,created_at,updated_at'

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`${context}: ${error?.message ?? 'невідома помилка'}`)
}

export interface Library {
  documents: DocumentRow[]
  years: AcademicYear[]
  authors: Author[]
}

export async function loadLibrary(): Promise<Library> {
  const [docs, years, authors] = await Promise.all([
    supabase.from('documents').select(DOC_COLUMNS).order('created_at', { ascending: false }).limit(2000),
    supabase.from('academic_years').select('id,name,is_current').order('name', { ascending: false }),
    supabase.from('profiles').select('id,full_name').order('full_name'),
  ])
  if (docs.error) fail('Не вдалося завантажити документи', docs.error)
  if (years.error) fail('Не вдалося завантажити навчальні роки', years.error)
  if (authors.error) fail('Не вдалося завантажити авторів', authors.error)
  return {
    documents: (docs.data ?? []) as DocumentRow[],
    years: (years.data ?? []) as AcademicYear[],
    authors: (authors.data ?? []) as Author[],
  }
}

export interface UploadMeta {
  title: string
  category: string
  topic: string
  academicYearId: string | null
  tags: string[]
}

export async function uploadDocument(file: File, type: FileType, meta: UploadMeta, authorId: string): Promise<DocumentRow> {
  const path = newStoragePath('documents', extensionOf(file.name) || type, crypto.randomUUID())
  const mime = mimeForType(type)
  const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: mime, upsert: false })
  if (up.error) fail('Не вдалося завантажити файл', up.error)
  const ins = await supabase
    .from('documents')
    .insert({
      title: meta.title.trim(),
      category: meta.category.trim() || null,
      topic: meta.topic.trim() || null,
      academic_year_id: meta.academicYearId,
      author_id: authorId,
      tags: meta.tags,
      storage_path: path,
      mime_type: mime,
    })
    .select(DOC_COLUMNS)
    .single()
  if (ins.error) {
    await supabase.storage.from(BUCKET).remove([path]) // не залишаємо файл-сироту
    fail('Не вдалося зберегти запис документа', ins.error)
  }
  return ins.data as DocumentRow
}

/** «Створити на основі…»: копія файлу в Storage + новий запис із based_on_document_id. */
export async function createBasedOn(
  source: DocumentRow,
  opts: { title: string; academicYearId: string | null; authorId: string },
): Promise<DocumentRow> {
  const ext = extensionOf(source.storage_path) || 'docx'
  const path = newStoragePath('documents', ext, crypto.randomUUID())
  const cp = await supabase.storage.from(BUCKET).copy(source.storage_path, path)
  if (cp.error) fail('Не вдалося скопіювати файл', cp.error)
  const ins = await supabase
    .from('documents')
    .insert({
      title: opts.title.trim(),
      category: source.category,
      topic: source.topic,
      academic_year_id: opts.academicYearId,
      author_id: opts.authorId,
      tags: source.tags,
      storage_path: path,
      mime_type: source.mime_type,
      based_on_document_id: source.id,
    })
    .select(DOC_COLUMNS)
    .single()
  if (ins.error) {
    await supabase.storage.from(BUCKET).remove([path])
    fail('Не вдалося створити запис документа', ins.error)
  }
  return ins.data as DocumentRow
}

/** Підписане посилання (60 с). Якщо задано filename — браузер завантажує файл, інакше показує inline. */
export async function signedUrl(path: string, filename?: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60, filename ? { download: filename } : undefined)
  if (error || !data) fail('Не вдалося отримати посилання на файл', error)
  return data.signedUrl
}

export async function downloadFile(path: string, title: string): Promise<void> {
  const url = await signedUrl(path, downloadName(title, path))
  const a = document.createElement('a')
  a.href = url
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export async function downloadBlob(path: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path)
  if (error || !data) fail('Не вдалося завантажити файл', error)
  return data
}

/** Повертає попередження (рядок), якщо запис видалено, а файл у сховищі — ні. */
export async function deleteDocument(doc: DocumentRow): Promise<string | null> {
  const del = await supabase.from('documents').delete().eq('id', doc.id).select('id')
  if (del.error) fail('Не вдалося видалити документ', del.error)
  if (!del.data || del.data.length === 0) throw new Error('Немає прав на видалення цього документа')
  const rm = await supabase.storage.from(BUCKET).remove([doc.storage_path])
  if (rm.error || !rm.data || rm.data.length === 0) {
    return 'Запис видалено, але файл у сховищі залишився (його може прибрати лише адміністратор).'
  }
  return null
}

// ---------------------------------------------------------------- шаблони

export async function loadTemplates(): Promise<TemplateRow[]> {
  const { data, error } = await supabase
    .from('document_templates')
    .select('id,title,storage_path,placeholders,created_at')
    .order('title')
  if (error) fail('Не вдалося завантажити шаблони', error)
  return (data ?? []).map((t) => ({ ...t, placeholders: Array.isArray(t.placeholders) ? (t.placeholders as string[]) : [] }))
}

export async function uploadTemplate(file: File, title: string, placeholders: string[]): Promise<void> {
  const path = newStoragePath('templates', 'docx', crypto.randomUUID())
  const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: mimeForType('docx'), upsert: false })
  if (up.error) fail('Не вдалося завантажити файл шаблону', up.error)
  const ins = await supabase.from('document_templates').insert({ title: title.trim(), storage_path: path, placeholders })
  if (ins.error) {
    await supabase.storage.from(BUCKET).remove([path])
    fail('Не вдалося зберегти шаблон (чи дозволено вам редагувати шаблони?)', ins.error)
  }
}

export async function deleteTemplate(t: TemplateRow): Promise<string | null> {
  const del = await supabase.from('document_templates').delete().eq('id', t.id).select('id')
  if (del.error) fail('Не вдалося видалити шаблон', del.error)
  if (!del.data || del.data.length === 0) throw new Error('Немає прав на видалення шаблону')
  const rm = await supabase.storage.from(BUCKET).remove([t.storage_path])
  return rm.error || !rm.data?.length ? 'Запис видалено, але файл шаблону у сховищі залишився.' : null
}

// ---------------------------------------------------------- налаштування

export const SETTING_EDIT_TEMPLATES = 'educators_can_edit_templates'

export async function loadEducatorsCanEditTemplates(): Promise<boolean> {
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', SETTING_EDIT_TEMPLATES).maybeSingle()
  if (error) fail('Не вдалося прочитати налаштування', error)
  return data?.value === true
}

export async function saveEducatorsCanEditTemplates(value: boolean): Promise<void> {
  const { error } = await supabase.from('app_settings').upsert({ key: SETTING_EDIT_TEMPLATES, value }, { onConflict: 'key' })
  if (error) fail('Не вдалося зберегти налаштування', error)
}

// ------------------------------------------------- дані для автозаповнення

export interface PupilOption extends StudentSource {
  id: string
}

interface RawStudent {
  id: string
  last_name: string
  first_name: string
  patronymic: string | null
  birth_date: string | null
  grade: number | null
  room_assignments: { rooms: { number: string; floor: number } | null }[]
  student_profiles: Record<string, string | null>[]
}

/** Активні учні + поточна кімната + затверджена анкета (лише те, що дозволяє RLS). Медичні дані не читаються. */
export async function loadPupils(): Promise<PupilOption[]> {
  const { data, error } = await supabase
    .from('students')
    .select(
      'id,last_name,first_name,patronymic,birth_date,grade,' +
        'room_assignments(to_date,rooms!room_assignments_room_id_fkey(number,floor)),' +
        'student_profiles(status,student_phone,address,group_number,profession,class_teacher,master,mother_name,mother_phone,father_name,father_phone,guardian_name,guardian_phone)',
    )
    .eq('status', 'active')
    .is('room_assignments.to_date', null)
    .eq('student_profiles.status', 'approved')
    .order('last_name')
    .order('first_name')
    .limit(1000)
  if (error) fail('Не вдалося завантажити учнів', error)
  return ((data ?? []) as unknown as RawStudent[]).map((s) => {
    const room = s.room_assignments[0]?.rooms
    const prof = s.student_profiles[0] ?? {}
    return {
      id: s.id,
      last_name: s.last_name,
      first_name: s.first_name,
      patronymic: s.patronymic,
      birth_date: s.birth_date,
      grade: s.grade,
      room: room?.number ?? null,
      floor: room?.floor ?? null,
      student_phone: prof.student_phone ?? null,
      address: prof.address ?? null,
      group_number: prof.group_number ?? null,
      profession: prof.profession ?? null,
      class_teacher: prof.class_teacher ?? null,
      master: prof.master ?? null,
      mother_name: prof.mother_name ?? null,
      mother_phone: prof.mother_phone ?? null,
      father_name: prof.father_name ?? null,
      father_phone: prof.father_phone ?? null,
      guardian_name: prof.guardian_name ?? null,
      guardian_phone: prof.guardian_phone ?? null,
    }
  })
}
