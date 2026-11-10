-- Курс навчання (1-3): адміністрація веде курс і групу, а не клас.
alter table public.students add column course smallint;
alter table public.students add constraint students_course_check check (course is null or course between 1 and 3);
comment on column public.students.course is 'Курс навчання 1-3 (NULL = невідомо).';
