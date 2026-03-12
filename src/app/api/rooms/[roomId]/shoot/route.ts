import {
  apiError,
  apiSuccess,
  buildRoomPayload,
  getRoomById,
  getRoomPlayer,
  parseJson,
  RouteContext,
  updateRoomPlayer,
} from "@/lib/rooms";
import { ShootPlayerRequest } from "@/types/game";

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { roomId } = await params;
    const body = await parseJson<ShootPlayerRequest>(request);

    if (!roomId || !body.hostUserId || !body.targetUserId) {
      return apiError("roomId, hostUserId, targetUserId는 필수입니다.", 400);
    }

    const { data: room, error: roomError } = await getRoomById(roomId);

    if (roomError) {
      return apiError(roomError.message, 500);
    }

    if (!room) {
      return apiError("방을 찾을 수 없습니다.", 404);
    }

    if (room.host_user_id !== body.hostUserId) {
      return apiError("방장만 저격할 수 있습니다.", 403);
    }

    if (room.status !== "RUNNING") {
      return apiError("게임 진행 중일 때만 저격할 수 있습니다.", 409);
    }

    if (room.signal_state !== "RED") {
      return apiError("RED 신호일 때만 저격할 수 있습니다.", 409);
    }

    const { data: target, error: targetError } = await getRoomPlayer(roomId, body.targetUserId);

    if (targetError) {
      return apiError(targetError.message, 500);
    }

    if (!target) {
      return apiError("대상 플레이어를 찾을 수 없습니다.", 404);
    }

    if (target.user_id === body.hostUserId) {
      return apiError("방장은 자신을 저격할 수 없습니다.", 409);
    }

    if (target.finished || target.status === "FINISHED") {
      return apiError("이미 완주한 플레이어는 저격할 수 없습니다.", 409);
    }

    if (target.eliminated || target.status === "ELIMINATED") {
      return apiError("이미 탈락한 플레이어입니다.", 409);
    }

    if (!target.flagged_on_red) {
      return apiError("이번 RED 구간에서 적발된 플레이어만 저격할 수 있습니다.", 409);
    }

    const { error: updateError } = await updateRoomPlayer(target.id, {
      flagged_on_red: false,
      eliminated: true,
      eliminated_at: new Date().toISOString(),
    });

    if (updateError) {
      return apiError(updateError.message, 500);
    }

    const payload = await buildRoomPayload(room);

    if (payload.error || !payload.data) {
      return apiError("저격 후 방 정보를 불러오지 못했습니다.", 500);
    }

    const updatedPlayer = payload.data.players.find(
      (entry) => entry.user_id === body.targetUserId
    );

    return apiSuccess({
      action: "shoot",
      room: payload.data.room,
      player: updatedPlayer,
      players: payload.data.players,
      results: payload.data.results,
    });
  } catch {
    return apiError("잘못된 요청 본문입니다.", 400);
  }
}
