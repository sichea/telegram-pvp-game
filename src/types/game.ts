export type SignalState = "GREEN" | "RED";
export type RoomStatus = "WAITING" | "RUNNING" | "FINISHED";
export type PlayerRole = "HOST" | "PLAYER";
export type PlayerStatus = "ALIVE" | "ELIMINATED" | "FINISHED";
export type WinCondition = "FIRST_FINISH";

export type CreateUserRequest = {
  telegramUserId: number;
  username?: string | null;
  displayName: string;
  profileImageUrl?: string | null;
};

export type UserRow = {
  id: string;
  telegram_user_id: number;
  username: string | null;
  display_name: string;
  profile_image_url: string | null;
  created_at: string;
};

export type RoomRow = {
  id: string;
  host_user_id: string;
  title: string;
  status: RoomStatus;
  signal_state: SignalState;
  win_condition: WinCondition;
  max_players: number;
  finish_distance: number;
  auto_eliminate_on_red_move: boolean;
  started_at: string | null;
  ended_at?: string | null;
  created_at?: string;
};

export type RoomPlayerRow = {
  id: string;
  room_id: string;
  user_id: string;
  role: PlayerRole;
  status: PlayerStatus;
  progress: number;
  position: number;
  violations: number;
  flagged_on_red: boolean;
  eliminated: boolean;
  finished: boolean;
  joined_at: string;
  eliminated_at: string | null;
  finish_at: string | null;
  users?: UserRow;
};

export type CreateRoomRequest = {
  hostUserId: string;
  title: string;
  maxPlayers?: number;
  finishDistance?: number;
  autoEliminateOnRedMove?: boolean;
};

export type JoinRoomRequest = {
  userId: string;
};

export type StartGameRequest = {
  hostUserId: string;
};

export type ToggleSignalRequest = {
  hostUserId: string;
  signal?: SignalState;
};

export type MovePlayerRequest = {
  userId: string;
  step?: number;
};

export type ShootPlayerRequest = {
  hostUserId: string;
  targetUserId: string;
};

export type RoomResults = {
  winner: RoomPlayerRow | null;
  winners: RoomPlayerRow[];
  finishedPlayers: RoomPlayerRow[];
  eliminatedPlayers: RoomPlayerRow[];
  activePlayers: RoomPlayerRow[];
  leaderboard: RoomPlayerRow[];
};
