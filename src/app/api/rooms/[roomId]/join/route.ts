import { apiError, apiSuccess, buildRoomPayload, getRoomById, getRoomPlayer, parseJson, RouteContext } from "@/lib/rooms";
import { supabase } from "@/lib/supabase";
import { resolveTelegramSession } from "@/lib/telegram";
import { JoinRoomRequest } from "@/types/game";

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { roomId } = await params;
    const body = await parseJson<JoinRoomRequest>(request);
    const { user: telegramUser, error: telegramError } = await resolveTelegramSession(request);

    if (telegramError) {
      return apiError(telegramError, 401);
    }

    const actorUserId = telegramUser?.id ?? body.userId;

    if (!roomId || !actorUserId) {
      return apiError("roomId와 userId는 필수입니다.", 400);
    }

    const { data: room, error: roomError } = await getRoomById(roomId);

    if (roomError) {
      return apiError(roomError.message, 500);
    }

    if (!room) {
      return apiError("방을 찾을 수 없습니다.", 404);
    }

    if (room.status !== "WAITING") {
      return apiError("현재 이 방은 참가를 받을 수 없습니다.", 409);
    }

    const { data: existingPlayer, error: existingPlayerError } = await getRoomPlayer(
      roomId,
      actorUserId
    );

    if (existingPlayerError) {
      return apiError(existingPlayerError.message, 500);
    }

    if (existingPlayer) {
      const payload = await buildRoomPayload(room);
      if (payload.error || !payload.data) {
        return apiError("방 정보를 불러오지 못했습니다.", 500);
      }
      return apiSuccess(payload.data);
    }

    const { count, error: countError } = await supabase
      .from("room_players")
      .select("*", { count: "exact", head: true })
      .eq("room_id", roomId);

    if (countError) {
      return apiError(countError.message, 500);
    }

    if ((count ?? 0) >= room.max_players) {
      return apiError("방이 가득 찼습니다.", 409);
    }

    const { error } = await supabase.from("room_players").insert({
      room_id: roomId,
      user_id: actorUserId,
      role: "PLAYER",
      status: "ALIVE",
      progress: 0,
      position: 0,
      violations: 0,
      flagged_on_red: false,
      eliminated: false,
      finished: false,
    });

    if (error) {
      return apiError(error.message, 500);
    }

    const payload = await buildRoomPayload(room);

    if (payload.error || !payload.data) {
      return apiError("참가 후 방 정보를 불러오지 못했습니다.", 500);
    }

    return apiSuccess(payload.data, 201);
  } catch {
    return apiError("잘못된 요청 본문입니다.", 400);
  }
}
