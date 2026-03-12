"use client";

import { useMemo, useState, type ReactNode } from "react";

type ApiResponse<T = unknown> = {
  success: boolean;
  data: T | null;
  error: string | null;
};

type SavedUser = {
  id: string;
  telegramUserId: string;
  username: string;
  displayName: string;
};

type RoomPlayer = {
  id: string;
  user_id: string;
  position: number;
  violations: number;
  eliminated: boolean;
  finished: boolean;
  users?: {
    display_name?: string | null;
    username?: string | null;
  };
};

type RoomData = {
  room: {
    id: string;
    title: string;
    status: string;
    signal_state: string;
    signalState: string;
    finish_distance: number;
    auto_eliminate_on_red_move: boolean;
  };
  players: RoomPlayer[];
  results: {
    winners: RoomPlayer[];
    finishedPlayers: RoomPlayer[];
    eliminatedPlayers: RoomPlayer[];
    activePlayers: RoomPlayer[];
  };
};

type RoomListItem = {
  room: RoomData["room"];
  players: RoomPlayer[];
  summary: {
    playerCount: number;
    activeCount: number;
    finishedCount: number;
    eliminatedCount: number;
  };
};

type ResponseMap = Record<string, string>;

const initialResponses: ResponseMap = {
  user: "",
  room: "",
  rooms: "",
  join: "",
  detail: "",
  start: "",
  signal: "",
  move: "",
};

function pretty(value: unknown) {
  return JSON.stringify(value, null, 2);
}

async function request<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = (await response.json()) as ApiResponse<T>;

  return {
    ok: response.ok,
    status: response.status,
    body: data,
  };
}

export default function HomePage() {
  const [responses, setResponses] = useState<ResponseMap>(initialResponses);
  const [roomSnapshot, setRoomSnapshot] = useState<RoomData | null>(null);
  const [roomList, setRoomList] = useState<RoomListItem[]>([]);
  const [savedUsers, setSavedUsers] = useState<SavedUser[]>([]);
  const [userForm, setUserForm] = useState({
    telegramUserId: "100000001",
    username: "player_one",
    displayName: "플레이어 1",
  });
  const [roomForm, setRoomForm] = useState({
    hostUserId: "",
    title: "쿠코로 RLGL 테스트 방",
    maxPlayers: "8",
    finishDistance: "10",
    autoEliminateOnRedMove: false,
  });
  const [joinForm, setJoinForm] = useState({
    userId: "",
  });
  const [gameForm, setGameForm] = useState({
    roomId: "",
    hostUserId: "",
    moveUserId: "",
    step: "1",
    signal: "TOGGLE",
  });

  const roomEndpoint = useMemo(() => {
    return gameForm.roomId ? `/api/rooms/${gameForm.roomId}` : "";
  }, [gameForm.roomId]);

  const writeResponse = (key: keyof ResponseMap, payload: unknown) => {
    setResponses((current) => ({
      ...current,
      [key]: pretty(payload),
    }));
  };

  const syncRoomSnapshot = (payload: ApiResponse<unknown> | null | undefined) => {
    const roomData = payload?.data as RoomData | undefined;
    if (roomData?.room && Array.isArray(roomData.players)) {
      setRoomSnapshot(roomData);
    }
  };

  const rememberUser = (user: SavedUser) => {
    setSavedUsers((current) => {
      if (current.some((entry) => entry.id === user.id)) {
        return current;
      }
      return [...current, user];
    });
  };

  const loadRooms = async () => {
    const result = await request<{ rooms: RoomListItem[] }>("/api/rooms");
    writeResponse("rooms", result);
    setRoomList(result.body.data?.rooms ?? []);
  };

  const refreshRoomDetail = async () => {
    if (!roomEndpoint) {
      return;
    }

    const result = await request<RoomData>(roomEndpoint);
    writeResponse("detail", result);
    syncRoomSnapshot(result.body);
  };

  const createUser = async () => {
    const result = await request<{
      user: { id: string; telegram_user_id: number; username: string | null; display_name: string };
      created: boolean;
    }>("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        telegramUserId: Number(userForm.telegramUserId),
        username: userForm.username || null,
        displayName: userForm.displayName,
      }),
    });

    writeResponse("user", result);

    const user = result.body.data?.user;
    if (user) {
      rememberUser({
        id: user.id,
        telegramUserId: String(user.telegram_user_id),
        username: user.username ?? "",
        displayName: user.display_name,
      });
      setRoomForm((current) => ({ ...current, hostUserId: user.id }));
      setJoinForm({ userId: user.id });
      setGameForm((current) => ({
        ...current,
        hostUserId: user.id,
        moveUserId: user.id,
      }));
      setUserForm((current) => ({
        ...current,
        telegramUserId: String(Number(current.telegramUserId) + 1),
      }));
    }
  };

  const createRoom = async () => {
    const result = await request<RoomData>("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hostUserId: roomForm.hostUserId,
        title: roomForm.title,
        maxPlayers: Number(roomForm.maxPlayers),
        finishDistance: Number(roomForm.finishDistance),
        autoEliminateOnRedMove: roomForm.autoEliminateOnRedMove,
      }),
    });

    writeResponse("room", result);
    syncRoomSnapshot(result.body);

    const roomId = result.body.data?.room.id;
    if (roomId) {
      setGameForm((current) => ({ ...current, roomId }));
      await loadRooms();
    }
  };

  const joinRoom = async () => {
    if (!roomEndpoint) {
      writeResponse("join", { success: false, data: null, error: "roomId가 필요합니다." });
      return;
    }

    const result = await request<RoomData>(`${roomEndpoint}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: joinForm.userId }),
    });

    writeResponse("join", result);
    syncRoomSnapshot(result.body);

    if (joinForm.userId) {
      setGameForm((current) => ({ ...current, moveUserId: joinForm.userId }));
    }

    await refreshRoomDetail();
    await loadRooms();
  };

  const getRoomDetail = async () => {
    if (!roomEndpoint) {
      writeResponse("detail", { success: false, data: null, error: "roomId가 필요합니다." });
      return;
    }

    await refreshRoomDetail();
  };

  const startGame = async () => {
    if (!roomEndpoint) {
      writeResponse("start", { success: false, data: null, error: "roomId가 필요합니다." });
      return;
    }

    const result = await request<RoomData>(`${roomEndpoint}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hostUserId: gameForm.hostUserId }),
    });

    writeResponse("start", result);
    syncRoomSnapshot(result.body);
    await refreshRoomDetail();
    await loadRooms();
  };

  const toggleSignal = async () => {
    if (!roomEndpoint) {
      writeResponse("signal", { success: false, data: null, error: "roomId가 필요합니다." });
      return;
    }

    const result = await request<RoomData>(`${roomEndpoint}/signal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hostUserId: gameForm.hostUserId,
        signal: gameForm.signal === "TOGGLE" ? undefined : gameForm.signal,
      }),
    });

    writeResponse("signal", result);
    syncRoomSnapshot(result.body);
    await refreshRoomDetail();
    await loadRooms();
  };

  const movePlayer = async () => {
    if (!roomEndpoint) {
      writeResponse("move", { success: false, data: null, error: "roomId가 필요합니다." });
      return;
    }

    const result = await request<{
      action: string;
      room: RoomData["room"];
      player: RoomPlayer;
      players: RoomPlayer[];
      results: RoomData["results"];
    }>(`${roomEndpoint}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: gameForm.moveUserId,
        step: Number(gameForm.step),
      }),
    });

    writeResponse("move", result);

    if (result.body.data?.room) {
      setRoomSnapshot({
        room: result.body.data.room,
        players: result.body.data.players,
        results: result.body.data.results,
      });
    }

    await refreshRoomDetail();
    await loadRooms();
  };

  const selectRoom = (roomId: string) => {
    setGameForm((current) => ({ ...current, roomId }));
  };

  const assignUser = (userId: string, target: "host" | "join" | "move") => {
    if (target === "host") {
      setRoomForm((current) => ({ ...current, hostUserId: userId }));
      setGameForm((current) => ({ ...current, hostUserId: userId }));
      return;
    }

    if (target === "join") {
      setJoinForm({ userId });
      return;
    }

    setGameForm((current) => ({ ...current, moveUserId: userId }));
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#22473a_0%,#101b16_45%,#09110d_100%)] px-4 py-10 text-stone-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="rounded-[28px] border border-white/10 bg-black/30 p-6 shadow-2xl shadow-black/30 backdrop-blur">
          <p className="text-xs uppercase tracking-[0.35em] text-emerald-300/80">
            텔레그램 쿠코로 MVP 디버그 콘솔
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">
            무궁화 꽃이 피었습니다 MVP
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-300">
            최소 제품 흐름은 유저 생성, 방 생성, 방 참가, 게임 시작, 이동, 결과 확인입니다.
            아래 로비와 유저 패널로 여러 명 테스트를 빠르게 반복할 수 있습니다.
          </p>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <Panel title="저장된 유저">
            <div className="flex flex-wrap gap-3">
              <ActionButton onClick={createUser}>유저 생성</ActionButton>
            </div>
            {savedUsers.length === 0 ? (
              <p className="text-sm text-stone-400">아직 생성된 유저가 없습니다.</p>
            ) : (
              <div className="grid gap-3">
                {savedUsers.map((user) => (
                  <div
                    key={user.id}
                    className="rounded-2xl border border-white/10 bg-black/20 p-4"
                  >
                    <div className="font-medium text-white">{user.displayName}</div>
                    <div className="mt-1 text-xs text-stone-400">
                      @{user.username || "no-username"} / TG {user.telegramUserId}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <SmallButton onClick={() => assignUser(user.id, "host")}>방장 지정</SmallButton>
                      <SmallButton onClick={() => assignUser(user.id, "join")}>참가 지정</SmallButton>
                      <SmallButton onClick={() => assignUser(user.id, "move")}>이동 지정</SmallButton>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="방 로비">
            <div className="flex flex-wrap gap-3">
              <ActionButton onClick={loadRooms}>방 목록 새로고침</ActionButton>
            </div>
            {roomList.length === 0 ? (
              <p className="text-sm text-stone-400">불러온 방이 없습니다.</p>
            ) : (
              <div className="grid gap-3">
                {roomList.map((entry) => (
                  <div
                    key={entry.room.id}
                    className="rounded-2xl border border-white/10 bg-black/20 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium text-white">{entry.room.title}</div>
                        <div className="mt-1 text-xs text-stone-400">
                          {entry.room.status} / {entry.room.signalState} / 플레이어 {entry.summary.playerCount}명
                        </div>
                      </div>
                      <SmallButton onClick={() => selectRoom(entry.room.id)}>선택</SmallButton>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </section>

        {roomSnapshot ? (
          <section className="rounded-[24px] border border-white/10 bg-white/6 p-5 shadow-lg shadow-black/20 backdrop-blur-sm">
            <h2 className="text-sm font-semibold uppercase tracking-[0.28em] text-emerald-200/90">
              현재 방 상태
            </h2>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <StatCard label="방 상태" value={roomSnapshot.room.status} />
              <StatCard label="신호" value={roomSnapshot.room.signalState} />
              <StatCard label="골인 거리" value={String(roomSnapshot.room.finish_distance)} />
              <StatCard
                label="RED 즉시 탈락"
                value={roomSnapshot.room.auto_eliminate_on_red_move ? "ON" : "OFF"}
              />
            </div>
            <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10 bg-black/20">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-white/5 text-stone-300">
                  <tr>
                    <th className="px-4 py-3">플레이어</th>
                    <th className="px-4 py-3">position</th>
                    <th className="px-4 py-3">violations</th>
                    <th className="px-4 py-3">eliminated</th>
                    <th className="px-4 py-3">finished</th>
                  </tr>
                </thead>
                <tbody>
                  {roomSnapshot.players.map((player) => (
                    <tr key={player.id} className="border-t border-white/10">
                      <td className="px-4 py-3">
                        {player.users?.display_name || player.users?.username || player.user_id}
                      </td>
                      <td className="px-4 py-3">{player.position}</td>
                      <td className="px-4 py-3">{player.violations}</td>
                      <td className="px-4 py-3">{String(player.eliminated)}</td>
                      <td className="px-4 py-3">{String(player.finished)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="grid gap-6">
            <Panel title="1. 유저 입력">
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="텔레그램 유저 ID">
                  <input value={userForm.telegramUserId} onChange={(event) => setUserForm((current) => ({ ...current, telegramUserId: event.target.value }))} className={inputClassName} />
                </Field>
                <Field label="유저명">
                  <input value={userForm.username} onChange={(event) => setUserForm((current) => ({ ...current, username: event.target.value }))} className={inputClassName} />
                </Field>
                <Field label="표시 이름">
                  <input value={userForm.displayName} onChange={(event) => setUserForm((current) => ({ ...current, displayName: event.target.value }))} className={inputClassName} />
                </Field>
              </div>
            </Panel>

            <Panel title="2. 방 생성">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <Field label="방장 유저 ID">
                  <input value={roomForm.hostUserId} onChange={(event) => setRoomForm((current) => ({ ...current, hostUserId: event.target.value }))} className={inputClassName} />
                </Field>
                <Field label="방 제목">
                  <input value={roomForm.title} onChange={(event) => setRoomForm((current) => ({ ...current, title: event.target.value }))} className={inputClassName} />
                </Field>
                <Field label="최대 인원">
                  <input value={roomForm.maxPlayers} onChange={(event) => setRoomForm((current) => ({ ...current, maxPlayers: event.target.value }))} className={inputClassName} />
                </Field>
                <Field label="골인 거리">
                  <input value={roomForm.finishDistance} onChange={(event) => setRoomForm((current) => ({ ...current, finishDistance: event.target.value }))} className={inputClassName} />
                </Field>
                <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-stone-200">
                  <input type="checkbox" checked={roomForm.autoEliminateOnRedMove} onChange={(event) => setRoomForm((current) => ({ ...current, autoEliminateOnRedMove: event.target.checked }))} className="h-4 w-4 accent-emerald-400" />
                  RED에서 이동 시 즉시 탈락
                </label>
              </div>
              <ActionButton onClick={createRoom}>방 생성</ActionButton>
            </Panel>

            <Panel title="3. 게임 진행">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <Field label="방 ID">
                  <input value={gameForm.roomId} onChange={(event) => setGameForm((current) => ({ ...current, roomId: event.target.value }))} className={inputClassName} />
                </Field>
                <Field label="방장 유저 ID">
                  <input value={gameForm.hostUserId} onChange={(event) => setGameForm((current) => ({ ...current, hostUserId: event.target.value }))} className={inputClassName} />
                </Field>
                <Field label="참가 유저 ID">
                  <input value={joinForm.userId} onChange={(event) => setJoinForm({ userId: event.target.value })} className={inputClassName} />
                </Field>
                <Field label="이동 유저 ID">
                  <input value={gameForm.moveUserId} onChange={(event) => setGameForm((current) => ({ ...current, moveUserId: event.target.value }))} className={inputClassName} />
                </Field>
                <Field label="이동 칸 수">
                  <input value={gameForm.step} onChange={(event) => setGameForm((current) => ({ ...current, step: event.target.value }))} className={inputClassName} />
                </Field>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <ActionButton onClick={joinRoom}>방 참가</ActionButton>
                <ActionButton onClick={getRoomDetail}>방 상세 조회</ActionButton>
                <ActionButton onClick={startGame}>게임 시작</ActionButton>
                <ActionButton onClick={movePlayer}>이동</ActionButton>
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <Field label="신호 요청">
                  <select value={gameForm.signal} onChange={(event) => setGameForm((current) => ({ ...current, signal: event.target.value }))} className={`${inputClassName} min-w-40`}>
                    <option value="TOGGLE">토글</option>
                    <option value="GREEN">GREEN 강제 설정</option>
                    <option value="RED">RED 강제 설정</option>
                  </select>
                </Field>
                <ActionButton onClick={toggleSignal}>신호 전환</ActionButton>
              </div>
            </Panel>
          </div>

          <div className="grid gap-4">
            <ResponseCard title="유저" content={responses.user} />
            <ResponseCard title="방 생성" content={responses.room} />
            <ResponseCard title="방 목록" content={responses.rooms} />
            <ResponseCard title="참가" content={responses.join} />
            <ResponseCard title="상세" content={responses.detail} />
            <ResponseCard title="시작" content={responses.start} />
            <ResponseCard title="신호" content={responses.signal} />
            <ResponseCard title="이동" content={responses.move} />
          </div>
        </section>
      </div>
    </main>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[24px] border border-white/10 bg-white/6 p-5 shadow-lg shadow-black/20 backdrop-blur-sm">
      <h2 className="text-sm font-semibold uppercase tracking-[0.28em] text-emerald-200/90">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2 text-sm text-stone-300">
      <span className="text-xs uppercase tracking-[0.22em] text-stone-400">{label}</span>
      {children}
    </label>
  );
}

function ActionButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-4 py-2 text-sm font-medium text-emerald-100 transition hover:border-emerald-200/40 hover:bg-emerald-300/20">
      {children}
    </button>
  );
}

function SmallButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-stone-200 transition hover:bg-white/10">
      {children}
    </button>
  );
}

function ResponseCard({ title, content }: { title: string; content: string }) {
  return (
    <section className="rounded-[22px] border border-white/10 bg-[#08110d]/80 p-4 shadow-lg shadow-black/20">
      <div className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-300/80">{title}</div>
      <pre className="mt-3 max-h-56 overflow-auto rounded-2xl bg-black/30 p-3 text-xs leading-5 text-stone-200">
        {content || "아직 응답이 없습니다."}
      </pre>
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-xs uppercase tracking-[0.22em] text-stone-400">{label}</div>
      <div className="mt-2 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

const inputClassName =
  "rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition placeholder:text-stone-500 focus:border-emerald-300/40 focus:bg-black/40";
