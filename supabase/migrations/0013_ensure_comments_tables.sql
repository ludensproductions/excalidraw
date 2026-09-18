-- =====================================================================
-- 0013_ensure_comments_tables.sql
-- Idempotently ensures comment tables exist in deployed Supabase projects.
-- =====================================================================

create table if not exists public.board_comments (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references public.drawings (id) on delete cascade,
  owner_id   uuid not null references auth.users (id) on delete cascade,
  author_name text not null default 'Usuario',
  body       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists board_comments_board_created_idx
  on public.board_comments (board_id, created_at asc);

create index if not exists board_comments_owner_idx
  on public.board_comments (owner_id);

alter table public.board_comments enable row level security;

drop policy if exists "board_comments: board owner read" on public.board_comments;
create policy "board_comments: board owner read"
  on public.board_comments for select
  using (
    exists (
      select 1 from public.drawings d
      where d.id = board_id and d.user_id = auth.uid()
    )
  );

drop policy if exists "board_comments: board owner insert" on public.board_comments;
create policy "board_comments: board owner insert"
  on public.board_comments for insert
  with check (
    auth.uid() = owner_id
    and exists (
      select 1 from public.drawings d
      where d.id = board_id and d.user_id = auth.uid()
    )
  );

drop policy if exists "board_comments: author update" on public.board_comments;
create policy "board_comments: author update"
  on public.board_comments for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "board_comments: author delete" on public.board_comments;
create policy "board_comments: author delete"
  on public.board_comments for delete
  using (auth.uid() = owner_id);

drop trigger if exists board_comments_touch_updated_at on public.board_comments;
create trigger board_comments_touch_updated_at
  before update on public.board_comments
  for each row execute function public.touch_updated_at();

create table if not exists public.shared_board_comments (
  id              uuid primary key default gen_random_uuid(),
  shared_board_id uuid not null references public.shared_boards (id) on delete cascade,
  owner_id        uuid not null references auth.users (id) on delete cascade,
  author_name     text not null default 'Usuario',
  body            text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists shared_board_comments_board_created_idx
  on public.shared_board_comments (shared_board_id, created_at asc);

create index if not exists shared_board_comments_owner_idx
  on public.shared_board_comments (owner_id);

alter table public.shared_board_comments enable row level security;

drop policy if exists "shared_board_comments: member read" on public.shared_board_comments;
create policy "shared_board_comments: member read"
  on public.shared_board_comments for select
  using (
    exists (
      select 1
      from public.shared_boards sb
      where sb.id = shared_board_id
        and (
          sb.created_by = auth.uid()
          or public.is_shared_board_member(sb.id)
        )
    )
  );

drop policy if exists "shared_board_comments: member insert" on public.shared_board_comments;
create policy "shared_board_comments: member insert"
  on public.shared_board_comments for insert
  with check (
    auth.uid() = owner_id
    and exists (
      select 1
      from public.shared_boards sb
      where sb.id = shared_board_id
        and (
          sb.created_by = auth.uid()
          or public.is_shared_board_member(sb.id)
        )
    )
  );

drop policy if exists "shared_board_comments: author update" on public.shared_board_comments;
create policy "shared_board_comments: author update"
  on public.shared_board_comments for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "shared_board_comments: author delete" on public.shared_board_comments;
create policy "shared_board_comments: author delete"
  on public.shared_board_comments for delete
  using (auth.uid() = owner_id);

drop trigger if exists shared_board_comments_touch_updated_at on public.shared_board_comments;
create trigger shared_board_comments_touch_updated_at
  before update on public.shared_board_comments
  for each row execute function public.touch_updated_at();

select pg_notify('pgrst', 'reload schema');
