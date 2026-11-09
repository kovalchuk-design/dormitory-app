import { useAuth } from '../auth/useAuth'
import { FullScreenMessage } from './FullScreenMessage'

export function AccountNotice({ kind }: { kind: 'no_profile' | 'profile_error' }) {
  const { signOut, session } = useAuth()
  return (
    <FullScreenMessage>
      <h1>{kind === 'no_profile' ? 'Доступ відсутній' : 'Помилка'}</h1>
      <p>
        {kind === 'no_profile'
          ? 'Ваш обліковий запис ще не активовано адміністратором.'
          : 'Не вдалося завантажити профіль. Спробуйте оновити сторінку пізніше.'}
      </p>
      {session?.user.email && <p className="muted">{session.user.email}</p>}
      <button type="button" onClick={() => void signOut()}>
        Вийти
      </button>
    </FullScreenMessage>
  )
}
