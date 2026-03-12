import { apiError, apiSuccess, buildRoomPayload, getRoomById, getRoomPlayer, isPositiveInteger, moveActionLabel, parseJson, RouteContext, updateRoomPlayer } from "@/lib/rooms";
import { MovePlayerRequest } from "@/types/game";

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { roomId } = await params;
    const body = await parseJson<MovePlayerRequest>(request);
    const step = body.step ?? 1;

    if (!roomId || !body.userId) {
      return apiError("roomId와 userId는 필수입니다.", 400);
    }

    if (!isPositiveInteger(step)) {
      return apiError("step은 1 이상의 정수여야 합니다.", 400);
    }

    const { data: room, error: roomError } = await getRoomById(roomId);

    if (roomError) {
      return apiError(roomError.message, 500);
    }

    if (!room) {
      return apiError("방을 찾을 수 없습니다.", 404);
    }

    if (room.status !== "RUNNING") {
      return apiError("게임이 진행 중일 때만 이동할 수 있습니다.", 409);
    }

    const { data: player, error: playerError } = await getRoomPlayer(roomId, body.userId);

    if (playerError) {
      return apiError(playerError.message, 500);
    }

    if (!player) {
      return apiError("플레이어를 찾을 수 없습니다.", 404);
    }

    if (player.finished || player.status === "FINISHED") {
      return apiError("이미 완주한 플레이어입니다.", 409);
    }

    if (player.eliminated || player.status === "ELIMINATED") {
      return apiError("이미 탈락한 플레이어입니다.", 409);
    }

    const timestamp = new Date().toISOString();
    const signal = room.signal_state;
    const currentPosition = player.position ?? player.progress ?? 0;

    if (signal === "GREEN") {
      const nextPosition = currentPosition + step;
      const finished = nextPosition >= room.finish_distance;
      const { error: updateError } = await updateRoomPlayer(player.id, {
        position: nextPosition,
        progress: nextPosition,
        finished,
        finish_at: finished ? timestamp : null,
      });

      if (updateError) {
        return apiError(updateError.message, 500);
      }

      const payload = await buildRoomPayload(room);

      if (payload.error || !payload.data) {
        return apiError("이동 후 방 정보를 불러오지 못했습니다.", 500);
      }

      const updatedPlayer = payload.data.players.find((entry) => entry.user_id === body.userId);

      return apiSuccess({
        action: moveActionLabel({ signal, finished, eliminated: false }),
        room: payload.data.room,
        player: updatedPlayer,
        players: payload.data.players,
        results: payload.data.results,
      });
    }

    const violations = (player.violations ?? 0) + 1;
    const eliminated = room.auto_eliminate_on_red_move;
    const { error: updateError } = await updateRoomPlayer(player.id, {
      violations,
      eliminated,
      eliminated_at: eliminated ? timestamp : null,
    });

    if (updateError) {
      return apiError(updateError.message, 500);
    }

    const payload = await buildRoomPayload(room);

    if (payload.error || !payload.data) {
      return apiError("이동 후 방 정보를 불러오지 못했습니다.", 500);
    }

    const updatedPlayer = payload.data.players.find((entry) => entry.user_id === body.userId);

    return apiSuccess({
      action: moveActionLabel({ signal, finished: false, eliminated }),
      room: payload.data.room,
      player: updatedPlayer,
      players: payload.data.players,
      results: payload.data.results,
    });
  } catch {
    return apiError("잘못된 요청 본문입니다.", 400);
  }
}
