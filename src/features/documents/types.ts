export interface DocumentRow {
  id: string
  title: string
  category: string | null
  topic: string | null
  academic_year_id: string | null
  author_id: string | null
  tags: string[]
  storage_path: string
  mime_type: string | null
  based_on_document_id: string | null
  created_at: string
  updated_at: string
}

export interface AcademicYear {
  id: string
  name: string
  is_current: boolean
}

export interface Author {
  id: string
  full_name: string
}

export interface TemplateRow {
  id: string
  title: string
  storage_path: string
  placeholders: string[]
  created_at: string
}

export type FileType = 'docx' | 'pdf' | 'other'

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
export const PDF_MIME = 'application/pdf'
