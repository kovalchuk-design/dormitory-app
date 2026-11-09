-- Місткість кімнати: лише 4, 5 або 6 місць; за замовчуванням 6.
alter table public.rooms drop constraint rooms_capacity_check;
alter table public.rooms add constraint rooms_capacity_check check (capacity in (4, 5, 6));
alter table public.rooms alter column capacity set default 6;
