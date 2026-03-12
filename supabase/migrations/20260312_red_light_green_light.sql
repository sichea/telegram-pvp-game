alter table public.room_players
  add column if not exists position integer not null default 0,
  add column if not exists violations integer not null default 0,
  add column if not exists eliminated boolean not null default false,
  add column if not exists finished boolean not null default false;

update public.room_players
set
  position = coalesce(position, progress, 0),
  progress = coalesce(progress, position, 0),
  violations = coalesce(violations, 0),
  eliminated = coalesce(eliminated, status = 'ELIMINATED'),
  finished = coalesce(finished, status = 'FINISHED');

alter table public.rooms
  add column if not exists ended_at timestamptz null;

create unique index if not exists room_players_room_id_user_id_idx
  on public.room_players (room_id, user_id);
