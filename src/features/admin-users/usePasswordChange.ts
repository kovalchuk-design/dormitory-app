import { useState, type FormEvent } from 'react'
import { useAuth } from '../../auth/useAuth'
import { supabase } from '../../lib/supabase'
import { checkPasswordPolicy } from '../../../supabase/functions/_shared/adminUsers.ts'

/** Логіка зміни власного пароля — спільна для обов'язкового екрана й попапа з меню акаунта. */
export function usePasswordChange() {
  const { reloadProfile } = useAuth()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const policy = checkPasswordPolicy(pw)
    if (policy) return setError(policy)
    if (pw !== pw2) return setError('Паролі не збігаються')
    setBusy(true)
    const { error: upErr } = await supabase.auth.updateUser({ password: pw })
    if (upErr) {
      setBusy(false)
      return setError(
        /same|different/i.test(upErr.message) ? 'Новий пароль має відрізнятися від поточного'
          : /weak|short|least/i.test(upErr.message) ? 'Пароль занадто простий або короткий'
          : 'Не вдалося змінити пароль. Спробуйте ще раз',
      )
    }
    const { error: rpcErr } = await supabase.rpc('complete_password_change')
    setBusy(false)
    if (rpcErr) return setError('Пароль змінено, але не вдалося зняти позначку. Оновіть сторінку')
    setPw(''); setPw2(''); setDone(true)
    await reloadProfile()
  }
  return { pw, setPw, pw2, setPw2, error, done, busy, submit }
}
