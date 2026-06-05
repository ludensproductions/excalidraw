-- =====================================================================
-- 0006_board_comments.sql
-- Comments attached to saved boards.
-- =====================================================================

create table if not exists public.board_comments (
  id          uuid primary key default gen_random_uuid(),
  board_id    uuid not null references public.boards (id) on delete cascade,
  owner_id    uuid not null references auth.users (id) on delete cascade,
  author_name text not null default 'Usuario',
  body        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
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
      select 1
      from public.boards b
      where b.id = board_id
        and b.owner_id = auth.uid()
    )
  );

drop policy if exists "board_comments: board owner insert" on public.board_comments;
create policy "board_comments: board owner insert"
  on public.board_comments for insert
  with check (
    auth.uid() = owner_id
    and exists (
      select 1
      from public.boards b
      where b.id = board_id
        and b.owner_id = auth.uid()
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
