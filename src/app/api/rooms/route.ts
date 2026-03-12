import { NextRequest } from "next/server";
import { apiError, apiSuccess, buildRoomPayload } from "@/lib/rooms";
import { supabase } from "@/lib/supabase";
import { resolveTelegramSession } from "@/lib/telegram";
import { CreateRoomRequest, RoomRow } from "@/types/game";

export async function GET() {
  const { data: rooms, error } = await supabase
    .from("rooms")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20)
    .returns<RoomRow[]>();

  if (error) {
    return apiError(error.message, 500);
  }

  const payloads = await Promise.all(
    (rooms ?? []).map(async (room) => {
      const payload = await buildRoomPayload(room);

      if (!payload.data) {
        return null;
      }

      return {
        room: payload.data.room,
        players: payload.data.players,
        summary: {
          playerCount: payload.data.players.length,
          activeCount: payload.data.results.activePlayers.length,
          finishedCount: payload.data.results.finishedPlayers.length,
          eliminatedCount: payload.data.results.eliminatedPlayers.length,
        },
      };
    })
  );

  return apiSuccess({
    rooms: payloads.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CreateRoomRequest;
    const { user: telegramUser, error: telegramError } = await resolveTelegramSession(req);
    if (telegramError) {
      return apiError(telegramError, 401);
    }

    const hostUserId = telegramUser?.id ?? body.hostUserId;
    const title = body.title?.trim();
    const maxPlayers = body.maxPlayers ?? 16;
    const finishDistance = body.finishDistance ?? 10;
    const autoEliminateOnRedMove = body.autoEliminateOnRedMove ?? false;

    if (!hostUserId || !title) {
      return apiError("hostUserId와 title은 필수입니다.", 400);
    }

    if (!Number.isInteger(maxPlayers) || maxPlayers < 2) {
      return apiError("maxPlayers는 2 이상인 정수여야 합니다.", 400);
    }

    if (!Number.isInteger(finishDistance) || finishDistance < 1) {
      return apiError("finishDistance는 1 이상의 정수여야 합니다.", 400);
    }

    const { data: hostUser, error: hostError } = await supabase
      .from("users")
      .select("id")
      .eq("id", hostUserId)
      .maybeSingle();

    if (hostError) {
      return apiError(hostError.message, 500);
    }

    if (!hostUser) {
      return apiError("방장 유저를 찾을 수 없습니다.", 404);
    }

    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .insert({
        host_user_id: hostUserId,
        title,
        status: "WAITING",
        signal_state: "GREEN",
        win_condition: "FIRST_FINISH",
        max_players: maxPlayers,
        finish_distance: finishDistance,
        auto_eliminate_on_red_move: autoEliminateOnRedMove,
      })
      .select("*")
      .single();

    if (roomError || !room) {
      return apiError(roomError?.message ?? "방 생성에 실패했습니다.", 500);
    }

    const { error: playerError } = await supabase.from("room_players").insert({
      room_id: room.id,
      user_id: hostUserId,
      role: "HOST",
      status: "ALIVE",
      progress: 0,
      position: 0,
      violations: 0,
      flagged_on_red: false,
      eliminated: false,
      finished: false,
    });

    if (playerError) {
      return apiError(playerError.message, 500);
    }

    const payload = await buildRoomPayload(room);

    if (payload.error || !payload.data) {
      return apiError("생성된 방 정보를 불러오지 못했습니다.", 500);
    }

    return apiSuccess(payload.data, 201);
  } catch {
    return apiError("잘못된 요청 본문입니다.", 400);
  }
}
