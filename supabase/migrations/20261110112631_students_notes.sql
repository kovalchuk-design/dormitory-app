-- Службові примітки до картки учня (що уточнити, чого бракує тощо).
alter table public.students add column notes text;
comment on column public.students.notes is 'Вільні примітки адміністрації до картки (що потребує уточнення).';
