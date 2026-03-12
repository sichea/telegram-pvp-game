import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { buildRoomResults } from "@/lib/gameState";
import { RoomPlayerRow, RoomRow, SignalState } from "@/types/game";

export type RouteContext = {
  params: Promise<{
    roomId: string;
  }>;
};

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data, error: null }, { status });
}

export function apiError(error: string, status = 400) {
  return NextResponse.json({ success: false, data: null, error }, { status });
}

export async function parseJson<T>(request: Request): Promise<T> {
  return (await request.json()) as T;
}

export function isPositiveInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export async function getRoomById(roomId: string) {
  const { data, error } = await supabase
    .from("rooms")
    .select("*")
    .eq("id", roomId)
    .single<RoomRow>();

  return { data, error };
}

export async function getRoomPlayers(roomId: string) {
  return supabase
    .from("room_players")
    .select(
      `
        id,
        room_id,
        user_id,
        role,
        status,
        progress,
        position,
        violations,
        eliminated,
        finished,
        joined_at,
        eliminated_at,
        finish_at,
        users (
          id,
          telegram_user_id,
          username,
          display_name,
          profile_image_url,
          created_at
        )
      `
    )
    .eq("room_id", roomId)
    .order("joined_at", { ascending: true })
    .returns<RoomPlayerRow[]>();
}

export async function getRoomPlayer(roomId: string, userId: string) {
  const { data, error } = await supabase
    .from("room_players")
    .select("*")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle<RoomPlayerRow>();

  return { data, error };
}

export function normalizePlayer(player: Partial<RoomPlayerRow>): Partial<RoomPlayerRow> {
  const position = player.position ?? player.progress ?? 0;
  const finished = player.finished ?? player.status === "FINISHED";
  const eliminated = player.eliminated ?? player.status === "ELIMINATED";

  return {
    ...player,
    progress: position,
    position,
    violations: player.violations ?? 0,
    finished,
    eliminated,
    status: finished ? "FINISHED" : eliminated ? "ELIMINATED" : "ALIVE",
  };
}

export async function updateRoomPlayer(playerId: string, values: Partial<RoomPlayerRow>) {
  return supabase
    .from("room_players")
    .update(normalizePlayer(values))
    .eq("id", playerId)
    .select("*")
    .single<RoomPlayerRow>();
}

export async function updateRoom(roomId: string, values: Partial<RoomRow>) {
  return supabase
    .from("rooms")
    .update(values)
    .eq("id", roomId)
    .select("*")
    .single<RoomRow>();
}

export async function resolveRoomState(roomId: string) {
  const { data: players, error } = await getRoomPlayers(roomId);

  if (error) {
    return { players: null, results: null, error };
  }

  const normalizedPlayers = (players ?? []).map((player) =>
    normalizePlayer(player) as RoomPlayerRow
  );
  const results = buildRoomResults(normalizedPlayers);

  return { players: normalizedPlayers, results, error: null };
}

export async function finalizeRoomIfNeeded(room: RoomRow) {
  const { players, results, error } = await resolveRoomState(room.id);

  if (error || !players || !results) {
    return { room, players, results, error };
  }

  let nextRoom = room;
  const shouldFinish =
    room.status === "RUNNING" &&
    (results.finishedPlayers.length > 0 || results.activePlayers.length === 0);

  if (shouldFinish) {
    const { data: finishedRoom } = await updateRoom(room.id, {
      status: "FINISHED",
      ended_at: new Date().toISOString(),
    });

    if (finishedRoom) {
      nextRoom = finishedRoom;
    }
  }

  return { room: nextRoom, players, results, error: null };
}

export async function buildRoomPayload(room: RoomRow) {
  const { room: resolvedRoom, players, results, error } = await finalizeRoomIfNeeded(room);

  if (error || !players || !results) {
    return { data: null, error };
  }

  return {
    data: {
      room: {
        ...resolvedRoom,
        status: resolvedRoom.status,
        signalState: resolvedRoom.signal_state,
      },
      players: players.map((player) => ({
        ...player,
        position: player.position,
        violations: player.violations,
        eliminated: player.eliminated,
        finished: player.finished,
      })),
      results,
    },
    error: null,
  };
}

export function nextSignal(current: SignalState, requested?: SignalState) {
  if (requested) {
    return requested;
  }

  return current === "GREEN" ? "RED" : "GREEN";
}

export function moveActionLabel(options: {
  signal: SignalState;
  finished: boolean;
  eliminated: boolean;
}) {
  if (options.signal === "GREEN") {
    return options.finished ? "finish" : "move";
  }

  return options.eliminated ? "eliminated" : "violation";
}
