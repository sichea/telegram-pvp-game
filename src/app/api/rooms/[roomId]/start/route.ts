import { apiError, apiSuccess, buildRoomPayload, getRoomById, parseJson, RouteContext, updateRoom } from "@/lib/rooms";
import { supabase } from "@/lib/supabase";
import { resolveTelegramSession } from "@/lib/telegram";
import { StartGameRequest } from "@/types/game";

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { roomId } = await params;
    const body = await parseJson<StartGameRequest>(request);
    const { user: telegramUser, error: telegramError } = await resolveTelegramSession(request);

    if (telegramError) {
      return apiError(telegramError, 401);
    }

    const hostUserId = telegramUser?.id ?? body.hostUserId;

    if (!roomId || !hostUserId) {
      return apiError("roomId와 hostUserId는 필수입니다.", 400);
    }

    const { data: room, error: roomError } = await getRoomById(roomId);

    if (roomError) {
      return apiError(roomError.message, 500);
    }

    if (!room) {
      return apiError("방을 찾을 수 없습니다.", 404);
    }

    if (room.host_user_id !== hostUserId) {
      return apiError("방장만 게임을 시작할 수 있습니다.", 403);
    }

    if (room.status !== "WAITING") {
      return apiError("이미 시작되었거나 종료된 방입니다.", 409);
    }

    const { error: resetPlayersError } = await supabase
      .from("room_players")
      .update({
        status: "ALIVE",
        progress: 0,
        position: 0,
        violations: 0,
        flagged_on_red: false,
        eliminated: false,
        finished: false,
        eliminated_at: null,
        finish_at: null,
      })
      .eq("room_id", roomId);

    if (resetPlayersError) {
      return apiError(resetPlayersError.message, 500);
    }

    const { data: startedRoom, error } = await updateRoom(roomId, {
      status: "RUNNING",
      signal_state: "GREEN",
      started_at: new Date().toISOString(),
      ended_at: null,
    });

    if (error || !startedRoom) {
      return apiError(error?.message ?? "게임 시작에 실패했습니다.", 500);
    }

    const payload = await buildRoomPayload(startedRoom);

    if (payload.error || !payload.data) {
      return apiError("시작 후 방 정보를 불러오지 못했습니다.", 500);
    }

    return apiSuccess(payload.data);
  } catch {
    return apiError("잘못된 요청 본문입니다.", 400);
  }
}
