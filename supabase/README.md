# База даних dormitory-app (Supabase)

Проєкт Supabase: `jlydikbswysopdbddnqz` (Frankfurt, Postgres 17).
Дані — **персональні дані неповнолітніх**: усі таблиці закриті RLS, `anon` не має жодного доступу, `authenticated` — лише явні GRANT + політики, і лише для **активних** користувачів (`profiles.is_active = true`).

## Структура папки

| Шлях | Призначення |
|---|---|
| `migrations/` | міграції (ім'я = версія, що застосована в БД) |
| `tests/001_security_and_functions.sql` | SQL-тести (запуск в одній транзакції з `ROLLBACK`, дані не залишаються) |
| `../src/lib/database.types.ts` | згенеровані TypeScript-типи |

## Ролі (`profiles.role`)

| Роль | Можливості |
|---|---|
| `admin` | повний доступ; активує користувачів, призначає ролі/поверх, затверджує звіти, видаляє учнів/історію, читає `audit_log` |
| `educator` | працює з учнями/кімнатами/заходами/документами; прив'язаний до одного поверху (`profiles.floor`). Читає всіх учнів і медичні дані, **редагує** лише учнів свого поверху (та ще не заселених), змінює `capacity` кімнат свого поверху |
| `staff_readonly` | читає списки учнів, контакти (лише **затверджені** версії анкет), кімнати (лише поточне заселення). **Без** медичних даних, історії, заходів; нічого не редагує |
| *неактивний* | (`is_active = false`, стан за замовчуванням після реєстрації) — не бачить нічого, крім власного профілю |

Учні акаунтів **не мають** — вони заповнюють анкету за одноразовим персональним посиланням (токен).

Користувач **не може** змінити власні `role`, `floor`, `is_active`: на рівні колонкових GRANT (змінювати можна лише `full_name`) + тригер-запобіжник. Змінює їх лише адмін через `admin_set_profile(...)` (адмін не може змінити сам себе).

## Таблиці

- `profiles` — користувачі додатку (рядок створюється тригером на `auth.users`: `staff_readonly`, неактивний).
- `academic_years` — навчальні роки; лише один `is_current` (унікальний частковий індекс).
- `students` — стабільні дані учня (ПІБ, дата народження, клас 9–11, статус `active/graduated/left`, поточний навчальний рік).
- `student_profiles` — **версіонована анкета** (`version_no`, статус `pending/approved/superseded`, поля з паперової анкети). Не більше однієї `approved` на учня (частковий унікальний індекс). Старі версії зберігаються.
- `student_medical` — алергії, хронічні стани, примітки. Лише `admin` та `educator`.
- `rooms` — кімнати (поверх 2–5, унікальний номер, `capacity` 1–10, за замовчуванням 4, `is_active`).
- `room_assignments` — повна історія заселень (`to_date IS NULL` = поточне). Один відкритий запис на учня (частковий унікальний індекс). Напряму не пишеться — лише через функції.
- `v_room_occupancy` (view, `security_invoker`) — кімната, місткість, зайнято, вільно.
- `update_requests` — одноразові посилання для учнів: зберігається лише **SHA-256 хеш** токена (`token_hash`, унікальний), `expires_at`, `used_at`, `kind` (`annual`/`update`), `resulting_profile_id`. Колонка `token_hash` недоступна клієнтам (колонковий GRANT) — у запитах треба **перелічувати колонки**, `select('*')` поверне помилку.
- `audit_log` — журнал змін (тригери на `student_profiles`, `student_medical`, `room_assignments`, `profiles`). Читає лише `admin`; ніхто не може змінювати/видаляти через API. Для `student_medical` пишуться лише **назви змінених полів**, не значення.
- Заходи: `event_quotas`, `event_sessions` (статуси `draft/held/approved`; затверджує лише адмін), `event_attendance` (унікально `session_id + student_id`), `event_plan`.
- Документи: `documents`, `document_templates` + приватний бакет Storage `documents`.

## Функції

Публічні (RPC, `authenticated`, кожна сама перевіряє роль/поверх; `anon` виклик заборонений):

| Функція | Опис |
|---|---|
| `assign_student(student, room, reason)` | перше заселення; блокує кімнату (`FOR UPDATE`) |
| `move_student(student, room, reason)` | атомарне переселення: закриває поточний запис (`to_date = сьогодні`), відкриває новий. Educator — лише якщо вихідна **або** цільова кімната на його поверсі |
| `approve_student_profile(profile_id)` | затверджує `pending`-версію, попередню `approved` робить `superseded` |
| `create_update_request(student, kind, ttl_days)` | повертає «сирий» токен **один раз** (зберігається лише хеш). `ttl_days` 1–60 |
| `revoke_update_request(request_id)` | достроково скасовує невикористане посилання |
| `admin_set_profile(user, role, floor, is_active)` | лише admin: роль/поверх/активація |
| `set_current_academic_year(year)` | лише admin: атомарно міняє поточний рік |

Коди помилок у тексті винятку (для фронтенду): `ROOM_FULL`, `ROOM_INACTIVE`, `ALREADY_PLACED`, `ALREADY_IN_ROOM`, `NOT_PLACED`, `STUDENT_NOT_ACTIVE`, `NOT_PENDING`, `NOT_FOUND`, `FORBIDDEN`, `INVALID`, `CAPACITY_BELOW_OCCUPANCY`, `ROOM_NOT_EMPTY`.

Допоміжні (схема `private`, не відкрита через API): `current_app_role()`, `current_floor()`, `is_admin()`, `is_active_user()`, `student_floor()`, `can_edit_student()`, тощо. Всі `SECURITY DEFINER` з `search_path = ''`. Для неактивного користувача `current_app_role()`/`current_floor()` повертають `NULL`, `is_admin()` — `false`.

## Storage

Приватний бакет `documents` (до 25 МБ, дозволені PDF/Word/Excel/ODF/PNG/JPEG/TXT). Читають усі активні користувачі; завантажують `admin` та `educator`; змінюють/видаляють `admin` або educator-власник файлу (`owner_id`). Не зберігайте тут медичні документи учнів.

## Як створити першого адміна

1. Зареєструйтесь у додатку (створиться неактивний профіль `staff_readonly`).
2. У Supabase → SQL editor виконайте (підставте id з `auth.users` / `profiles`):

```sql
update profiles set role = 'admin', is_active = true where id = '<uuid користувача>';
```

3. Далі адмін активує інших у додатку: `rpc('admin_set_profile', { p_user_id, p_role, p_floor, p_is_active })`. Вихователю обов'язково вказати поверх (2–5).

## Публічна анкета (наступний етап)

Edge Function (service role) має: порахувати `sha256(токен)` → знайти `update_requests` з `used_at IS NULL AND expires_at > now()` → атомарно виставити `used_at` (`UPDATE … WHERE used_at IS NULL RETURNING`) → створити `student_profiles` зі статусом `pending` і записати `resulting_profile_id`. Таблиці вже це підтримують.

## Тести

`tests/001_security_and_functions.sql` виконується одним запитом (SQL editor / `execute_sql`), всередині `BEGIN … ROLLBACK`. Ролі емулюються через `set local role authenticated|anon` + `request.jwt.claims`. Останній запуск: 228 з 228 успішно. Обмеження: Supabase забороняє прямий `DELETE` у `storage.objects`, тому політики видалення в Storage перевіряються лише на наявність — їх поведінку треба перевірити через Storage API; конкурентні переселення (дві сесії одночасно) в одній транзакції не відтворюються.

## Свідомі рішення / відомі застереження

- Advisor `authenticated_security_definer_function_executable` (WARN) для 7 публічних RPC-функцій **навмисний**: вони мають бути викликані користувачами й самі перевіряють роль.
- Educator може редагувати ще **не заселених** учнів (бо в них немає поверху). Якщо треба суворіше — змінити `private.can_edit_student`.
- Educator читає медичні дані **всіх** учнів (за ТЗ), редагує — лише свого поверху.
- `staff_readonly` бачить `reason` лише для поточного заселення; історію не бачить.
- Шаблони документів змінює тільки admin.
- Під час міграцій відкликано EXECUTE у `anon/authenticated` для наявної функції проєкту `public.rls_auto_enable()` (тригер «automatic RLS»; їй не потрібен API-доступ).
- Unused index (INFO) — очікувано на порожній БД; індекси на зовнішніх ключах залишено навмисно.
