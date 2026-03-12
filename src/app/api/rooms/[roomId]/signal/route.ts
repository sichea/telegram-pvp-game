import { apiError, apiSuccess, buildRoomPayload, getRoomById, nextSignal, parseJson, RouteContext, updateRoom } from "@/lib/rooms";
import { supabase } from "@/lib/supabase";
import { ToggleSignalRequest } from "@/types/game";

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { roomId } = await params;
    const body = await parseJson<ToggleSignalRequest>(request);

    if (!roomId || !body.hostUserId) {
      return apiError("roomId와 hostUserId는 필수입니다.", 400);
    }

    const { data: room, error: roomError } = await getRoomById(roomId);

    if (roomError) {
      return apiError(roomError.message, 500);
    }

    if (!room) {
      return apiError("방을 찾을 수 없습니다.", 404);
    }

    if (room.host_user_id !== body.hostUserId) {
      return apiError("방장만 신호를 변경할 수 있습니다.", 403);
    }

    if (room.status !== "RUNNING") {
      return apiError("게임 진행 중일 때만 신호를 바꿀 수 있습니다.", 409);
    }

    const signal = nextSignal(room.signal_state, body.signal);
    const { data: updatedRoom, error } = await updateRoom(roomId, { signal_state: signal });

    if (error || !updatedRoom) {
      return apiError(error?.message ?? "신호 변경에 실패했습니다.", 500);
    }

    if (signal === "GREEN") {
      const { error: resetFlagError } = await supabase
        .from("room_players")
        .update({ flagged_on_red: false })
        .eq("room_id", roomId)
        .eq("flagged_on_red", true);

      if (resetFlagError) {
        return apiError(resetFlagError.message, 500);
      }
    }

    const payload = await buildRoomPayload(updatedRoom);

    if (payload.error || !payload.data) {
      return apiError("신호 변경 후 방 정보를 불러오지 못했습니다.", 500);
    }

    return apiSuccess(payload.data);
  } catch {
    return apiError("잘못된 요청 본문입니다.", 400);
  }
}
