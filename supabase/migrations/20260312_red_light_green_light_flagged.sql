alter table public.room_players
  add column if not exists flagged_on_red boolean not null default false;

update public.room_players
set flagged_on_red = false
where flagged_on_red is distinct from false;
