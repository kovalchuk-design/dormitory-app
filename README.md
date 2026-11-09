# Гуртожиток (dormitory-app)

Веб-застосунок для шкільного гуртожитку (≈250 учнів, 9–11 класи, поверхи 2–5, по одному вихователю на поверх). Інтерфейс — українською.

Стек: Vite + React + TypeScript, react-router (HashRouter), Supabase (авторизація та база даних), vitest. Це статичний сайт, що розгортається на GitHub Pages.

## Ролі

| Роль             | Опис                                              |
| ---------------- | ------------------------------------------------- |
| `admin`          | Адміністратор, бачить усі розділи, зокрема «Адміністрування» |
| `educator`       | Вихователь поверху                                |
| `staff_readonly` | Працівник з доступом лише для перегляду           |

Після входу застосунок завантажує рядок користувача з таблиці `profiles`. Якщо профілю немає, користувач бачить повідомлення «Ваш обліковий запис ще не активовано адміністратором».

## Запуск локально

Потрібен Node.js 20+ (рекомендовано 22).

```bash
npm install
cp .env.example .env.local   # значення Supabase (публічні)
npm run dev
```

Сайт відкриється на `http://localhost:5173/dormitory-app/`.

## Збірка, перевірки, тести

```bash
npm run build   # перевірка типів + production-збірка у dist/
npm run lint    # ESLint
npm test        # vitest
```

## Змінні оточення

| Змінна                          | Опис                                  |
| ------------------------------- | ------------------------------------- |
| `VITE_SUPABASE_URL`             | URL проєкту Supabase                  |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Публічний (publishable) ключ Supabase |

Ці значення публічні, тому `.env.production` закомічено. **Ніколи** не додавайте в репозиторій `service_role` ключ — безпека даних забезпечується політиками RLS у базі.

## Структура

```
src/
  lib/supabase.ts      клієнт Supabase
  auth/                AuthProvider, useAuth, RequireAuth, RequireRole, ролі
  routes/              маршрути (AppRoutes) та пункти навігації з фільтром за роллю
  components/          Layout (адаптивна оболонка), службові повідомлення
  pages/               сторінки (поки заглушки), вхід, публічна анкета
supabase/              схема бази даних (міграції)
.github/workflows/     деплой на GitHub Pages
```

Маршрути (HashRouter, URL виду `.../dormitory-app/#/students`):

- `#/login` — вхід за email і паролем
- `#/form/:token` — публічна анкета студента (без входу і навігації)
- `#/`, `#/students`, `#/rooms`, `#/documents`, `#/events`, `#/calendar` — після входу
- `#/admin` — лише для `admin`

## Розгортання (GitHub Pages)

Workflow `.github/workflows/deploy.yml` при кожному пуші в `main` збирає проєкт і публікує його на GitHub Pages.

**Одноразове налаштування власником репозиторію:** Settings → Pages → Build and deployment → Source = **GitHub Actions**. Без цього деплой не запрацює.

Адреса сайту: `https://kovalchuk-design.github.io/dormitory-app/`.

Також у Supabase (Authentication → URL Configuration) варто додати цю адресу до Site URL / Redirect URLs.
