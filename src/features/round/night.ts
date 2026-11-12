/**
 * «Вечір» обходу змінюється о 18:00 за Києвом (так само, як public.night_today() у базі):
 * до 18:00 діє вчорашній вечір, тож звіт видно весь наступний день, а о 18:00 починається чистий список.
 */
const TZ = 'Europe/Kyiv'
export const NIGHT_SWITCH_HOUR = 18

export function nightDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(now)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'))
  return new Date(wall - NIGHT_SWITCH_HOUR * 3600_000).toISOString().slice(0, 10)
}

/** «11 листопада» для підпису вечора. */
export function nightLabel(night: string): string {
  const [y, m, d] = night.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', timeZone: 'UTC' })
}
