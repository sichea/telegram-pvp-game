import { NextRequest } from "next/server";
import { apiError, apiSuccess, buildRoomPayload, getRoomById, RouteContext } from "@/lib/rooms";

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { roomId } = await params;

  if (!roomId) {
    return apiError("roomId가 필요합니다.", 400);
  }

  const { data: room, error: roomError } = await getRoomById(roomId);

  if (roomError) {
    return apiError(roomError.message, 500);
  }

  if (!room) {
    return apiError("방을 찾을 수 없습니다.", 404);
  }

  const payload = await buildRoomPayload(room);

  if (payload.error || !payload.data) {
    return apiError("방 정보를 불러오지 못했습니다.", 500);
  }

  return apiSuccess(payload.data);
}
