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
| `educator` | вихователі працюють позмінно (1 день чергування, 3 вихідних) і на зміні відповідають за **всі поверхи**. Тому **поверх — не межа доступу**: будь-який активний вихователь може заселяти/переселяти/виселяти будь-якого учня між будь-якими кімнатами і поверхами, редагувати дані будь-якого учня, затверджувати анкети, читати **і редагувати** медичні дані всіх учнів, змінювати `capacity` будь-якої кімнати. `profiles.floor` — лише «домашній поверх» (типовий фільтр в UI) |
| `staff_readonly` | читає списки учнів, **контакти всіх учнів на всіх поверхах** (затверджені версії анкет — екстрений доступ), кімнати та **повну історію заселень**. **Без** медичних даних; нічого не редагує |
| *неактивний* | (`is_active = false`, стан за замовчуванням після реєстрації) — не бачить нічого, крім власного профілю |

Учні акаунтів **не мають** — вони заповнюють анкету за одноразовим персональним посиланням (токен).

Користувач **не може** змінити власні `role`, `floor`, `is_active`: на рівні колонкових GRANT (змінювати можна лише `full_name`) + тригер-запобіжник. Змінює їх лише адмін через `admin_set_profile(...)` (адмін не може змінити сам себе).

## Таблиці

- `profiles` — користувачі додатку (рядок створюється тригером на `auth.users`: `staff_readonly`, неактивний).
- `academic_years` — навчальні роки; лише один `is_current` (унікальний частковий індекс).
- `students` — стабільні дані учня (ПІБ, дата народження, клас 9–11, статус `active/graduated/left`, поточний навчальний рік).
- `student_profiles` — **версіонована анкета** (`version_no`, статус `pending/approved/superseded`, поля з паперової анкети). Не більше однієї `approved` на учня (частковий унікальний індекс). Старі версії зберігаються.
- `student_medical` — алергії, хронічні стани, примітки. Лише `admin` та `educator`. Авторство: `created_by` (хто вніс) і `updated_by` (хто змінив останнім) проставляє тригер із `auth.uid()` — з клієнта підробити не можна; бачать їх усі, хто читає медичні дані. Повна історія змін по полях (без значень) — в `audit_log` (лише admin).
- `rooms` — кімнати (поверх 2–5, унікальний номер, `capacity` 1–10, за замовчуванням 4, `is_active`).
- `room_assignments` — повна історія заселень (`to_date IS NULL` = поточне; `reason`/`moved_by` — хто й чому заселив, `end_reason`/`ended_by` — хто й чому завершив проживання). Один відкритий запис на учня (частковий унікальний індекс). Напряму не пишеться, записи не видаляються (крім адміна) — лише через функції. Читають усі активні користувачі, включно зі `staff_readonly`.
- `v_unplaced_students` (view) — активні учні **без** відкритого заселення («пул незаселених»). Нові активні учні починаються саме з цього стану.
- `app_settings` — `key` (PK), `value jsonb`, `updated_by`, `updated_at`. Читають усі активні, змінює лише admin. Перемикачі прав; зараз є `educators_can_edit_templates` = `false` (за замовчуванням). Нові перемикачі додаються рядками без зміни схеми.
- `v_room_occupancy` (view, `security_invoker`) — кімната, місткість, зайнято, вільно.
- `update_requests` — одноразові посилання для учнів: зберігається лише **SHA-256 хеш** токена (`token_hash`, унікальний), `expires_at`, `used_at`, `kind` (`annual`/`update`), `resulting_profile_id`. Колонка `token_hash` недоступна клієнтам (колонковий GRANT) — у запитах треба **перелічувати колонки**, `select('*')` поверне помилку.
- `audit_log` — журнал змін (тригери на `student_profiles`, `student_medical`, `room_assignments`, `profiles`). Читає лише `admin`; ніхто не може змінювати/видаляти через API. Для `student_medical` пишуться лише **назви змінених полів**, не значення.
- Заходи: `event_quotas`, `event_sessions` (статуси `draft/held/approved`; затверджує лише адмін), `event_attendance` (унікально `session_id + student_id`), `event_plan`.
- Документи: `documents`, `document_templates` + приватний бакет Storage `documents`.

## Функції

Публічні (RPC, `authenticated`, кожна сама перевіряє роль (поверх не перевіряється); `anon` виклик заборонений):

| Функція | Опис |
|---|---|
| `assign_student(student, room, reason)` | заселення незаселеного учня в будь-яку кімнату; блокує кімнату (`FOR UPDATE`), перевіряє місткість/активність |
| `move_student(student, room, reason)` | атомарне переселення між будь-якими кімнатами/поверхами: закриває поточний запис (`to_date = сьогодні`, `ended_by`, `end_reason`), відкриває новий. Перевіряє місткість, активність кімнати і статус учня |
| `unassign_student(student, reason)` | повертає учня в пул незаселених («перетягнути назад»): закриває відкритий запис, історія зберігається. Працює для будь-якого статусу учня |
| `approve_student_profile(profile_id)` | затверджує `pending`-версію, попередню `approved` робить `superseded` |
| `create_update_request(student, kind, ttl_days)` | повертає «сирий» токен **один раз** (зберігається лише хеш). `ttl_days` 1–60 |
| `revoke_update_request(request_id)` | достроково скасовує невикористане посилання |
| `admin_set_profile(user, role, floor, is_active)` | лише admin: роль/поверх/активація |
| `set_current_academic_year(year)` | лише admin: атомарно міняє поточний рік |

Права на всі ці функції: `admin` та `educator`; `staff_readonly` і `anon` — ні.

Коди помилок у тексті винятку (для фронтенду): `ROOM_FULL`, `ROOM_INACTIVE`, `ALREADY_PLACED`, `ALREADY_IN_ROOM`, `NOT_PLACED`, `STUDENT_NOT_ACTIVE`, `NOT_PENDING`, `NOT_FOUND`, `FORBIDDEN`, `INVALID`, `CAPACITY_BELOW_OCCUPANCY`, `ROOM_NOT_EMPTY`.

Допоміжні (схема `private`, не відкрита через API): `current_app_role()`, `current_floor()`, `is_admin()`, `is_active_user()`, `can_edit_student()` (тепер = admin/educator, без перевірки поверху), `app_setting_true(key)`, тощо. Всі `SECURITY DEFINER` з `search_path = ''`. Для неактивного користувача `current_app_role()`/`current_floor()` повертають `NULL`, `is_admin()` — `false`.

## Шаблони документів і `app_settings`

`document_templates` читають усі активні. Писати може `admin` завжди, а `educator` — лише коли `app_settings.educators_can_edit_templates = true` (за замовчуванням `false`). Перемикає тільки admin:

```sql
update app_settings set value = 'true'::jsonb where key = 'educators_can_edit_templates';
```

## Storage

Приватний бакет `documents` (до 25 МБ, дозволені PDF/Word/Excel/ODF/PNG/JPEG/TXT). Читають усі активні користувачі; завантажують `admin` та `educator`; змінюють/видаляють `admin` або educator-власник файлу (`owner_id`). Не зберігайте тут медичні документи учнів.

## Як створити першого адміна

1. Зареєструйтесь у додатку (створиться неактивний профіль `staff_readonly`).
2. У Supabase → SQL editor виконайте (підставте id з `auth.users` / `profiles`):

```sql
update profiles set role = 'admin', is_active = true where id = '<uuid користувача>';
```

3. Далі адмін активує інших у додатку: `rpc('admin_set_profile', { p_user_id, p_role, p_floor, p_is_active })`. Активному вихователю потрібно вказати «домашній» поверх (2–5) — він використовується лише як типовий фільтр в UI, а не як обмеження прав.

## Публічна анкета (наступний етап)

Edge Function (service role) має: порахувати `sha256(токен)` → знайти `update_requests` з `used_at IS NULL AND expires_at > now()` → атомарно виставити `used_at` (`UPDATE … WHERE used_at IS NULL RETURNING`) → створити `student_profiles` зі статусом `pending` і записати `resulting_profile_id`. Таблиці вже це підтримують.

## Тести

`tests/001_security_and_functions.sql` (260 перевірок) та `tests/002_medical_authorship.sql` (5 перевірок авторства) виконуються одним запитом (SQL editor / `execute_sql`), всередині `BEGIN … ROLLBACK`. Ролі емулюються через `set local role authenticated|anon` + `request.jwt.claims`. Останній запуск: 260 з 260 успішно (покриває, зокрема: вихователь «поверху 4» переселяє між поверхами 2 і 5; `unassign_student` зберігає історію; вихователь читає/пише медичні дані інших поверхів, `staff_readonly` — ні; `staff_readonly` читає історію та контакти; перемикач шаблонів вкл/викл). Обмеження: Supabase забороняє прямий `DELETE` у `storage.objects`, тому політики видалення в Storage перевіряються лише на наявність — їх поведінку треба перевірити через Storage API; конкурентні переселення (дві сесії одночасно) в одній транзакції не відтворюються.

## Свідомі рішення / відомі застереження

- Advisor `authenticated_security_definer_function_executable` (WARN) для 8 публічних RPC-функцій **навмисний**: вони мають бути викликані користувачами й самі перевіряють роль.
- **Поверх більше не межа доступу** (вихователі чергують позмінно по всіх поверхах): будь-який активний educator/admin керує будь-яким учнем/кімнатою. Якщо знову знадобиться обмеження — змінити `private.can_edit_student` та політики `rooms`.
- Підтверджено власником: усі educator записують медичні дані (зі слів учнів, батьків тощо), **автор фіксується** (`created_by`/`updated_by` + `audit_log`). Читання медичних даних **не логується** (буде картка учня з вкладками). Домашній поверх активного вихователя обов'язковий (задає admin).
- `staff_readonly` бачить повну історію заселень (дати, причини, хто переселив) і затверджені контакти всіх учнів.
- `educator` змінює у `rooms` лише `capacity` (назву/поверх/активність — тільки admin); зменшити нижче поточної кількості мешканців не можна.
- `select *` з `update_requests` **навмисно** повертає помилку (колонка `token_hash` закрита) — перелічуйте колонки явно.
- Під час міграцій відкликано EXECUTE у `anon/authenticated` для наявної функції проєкту `public.rls_auto_enable()` (тригер «automatic RLS»; їй не потрібен API-доступ).
- Unused index (INFO) — очікувано на порожній БД; індекси на зовнішніх ключах залишено навмисно.
