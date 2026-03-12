import { PlayRoomClient } from "./PlayRoomClient";

export default async function PlayRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;

  return <PlayRoomClient roomId={roomId} />;
}
