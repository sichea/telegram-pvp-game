import { RoomPlayerRow, RoomResults } from "@/types/game";

export function buildRoomResults(players: RoomPlayerRow[]): RoomResults {
  const finishedPlayers = players.filter((player) => player.finished);
  const eliminatedPlayers = players.filter((player) => player.eliminated);
  const activePlayers = players.filter(
    (player) => !player.finished && !player.eliminated
  );

  const winners = [...finishedPlayers].sort((a, b) => {
    const aTime = a.finish_at ? Date.parse(a.finish_at) : Number.MAX_SAFE_INTEGER;
    const bTime = b.finish_at ? Date.parse(b.finish_at) : Number.MAX_SAFE_INTEGER;
    return aTime - bTime || b.position - a.position;
  });

  return {
    winners,
    finishedPlayers,
    eliminatedPlayers,
    activePlayers,
  };
}
