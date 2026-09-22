-- Lumbre: sincronización privada para una sola persona.
-- Ejecutar en Supabase SQL Editor una sola vez.
create table if not exists public.lumbre_books (
  id text primary key,
  owner uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.lumbre_positions (
  book_id text primary key references public.lumbre_books(id) on delete cascade,
  owner uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.lumbre_annotations (
  id text primary key,
  owner uuid not null references auth.users(id) on delete cascade,
  book_id text not null references public.lumbre_books(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.lumbre_settings (
  key text primary key,
  owner uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.lumbre_books enable row level security;
alter table public.lumbre_positions enable row level security;
alter table public.lumbre_annotations enable row level security;
alter table public.lumbre_settings enable row level security;

create policy "lumbre books own rows" on public.lumbre_books for all using (auth.uid() = owner) with check (auth.uid() = owner);
create policy "lumbre positions own rows" on public.lumbre_positions for all using (auth.uid() = owner) with check (auth.uid() = owner);
create policy "lumbre annotations own rows" on public.lumbre_annotations for all using (auth.uid() = owner) with check (auth.uid() = owner);
create policy "lumbre settings own rows" on public.lumbre_settings for all using (auth.uid() = owner) with check (auth.uid() = owner);

insert into storage.buckets (id, name, public) values ('lumbre-pdfs', 'lumbre-pdfs', false)
on conflict (id) do nothing;

create policy "lumbre pdf read own" on storage.objects for select using (bucket_id = 'lumbre-pdfs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "lumbre pdf write own" on storage.objects for insert with check (bucket_id = 'lumbre-pdfs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "lumbre pdf update own" on storage.objects for update using (bucket_id = 'lumbre-pdfs' and (storage.foldername(name))[1] = auth.uid()::text);
