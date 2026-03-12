import { RoomPlayerRow, RoomResults, WinCondition } from "@/types/game";

function sortPlayers(players: RoomPlayerRow[]) {
  return [...players].sort((a, b) => {
    const aTime = a.finish_at ? Date.parse(a.finish_at) : Number.MAX_SAFE_INTEGER;
    const bTime = b.finish_at ? Date.parse(b.finish_at) : Number.MAX_SAFE_INTEGER;
    return aTime - bTime || b.position - a.position || a.joined_at.localeCompare(b.joined_at);
  });
}

export function buildRoomResults(
  players: RoomPlayerRow[],
  winCondition: WinCondition = "FIRST_FINISH"
): RoomResults {
  const finishedPlayers = sortPlayers(players.filter((player) => player.finished));
  const eliminatedPlayers = sortPlayers(players.filter((player) => player.eliminated));
  const activePlayers = sortPlayers(
    players.filter((player) => !player.finished && !player.eliminated)
  );

  const winners =
    winCondition === "FIRST_FINISH" && finishedPlayers.length > 0
      ? [finishedPlayers[0]]
      : [];

  const leaderboard = [...winners, ...activePlayers, ...eliminatedPlayers];

  return {
    winner: winners[0] ?? null,
    winners,
    finishedPlayers,
    eliminatedPlayers,
    activePlayers,
    leaderboard,
  };
}
