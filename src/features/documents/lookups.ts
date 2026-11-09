import type { AcademicYear, Author } from './types'

export interface Lookups {
  years: Map<string, AcademicYear>
  authors: Map<string, Author>
}

export function makeLookups(years: AcademicYear[], authors: Author[]): Lookups {
  return { years: new Map(years.map((y) => [y.id, y])), authors: new Map(authors.map((a) => [a.id, a])) }
}
