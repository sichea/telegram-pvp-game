"use client";

import Link from "next/link";
import { startTransition, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type ApiResponse<T = unknown> = {
  success: boolean;
  data: T | null;
  error: string | null;
};

type RoomPlayer = {
  id: string;
  user_id: string;
  status?: string;
  position: number;
  violations: number;
  flagged_on_red?: boolean;
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
    host_user_id?: string;
    title: string;
    status: string;
    signalState: string;
    finish_distance: number;
    auto_eliminate_on_red_move: boolean;
  };
  players: RoomPlayer[];
  results: {
    winner: RoomPlayer | null;
    winners: RoomPlayer[];
    finishedPlayers: RoomPlayer[];
    eliminatedPlayers: RoomPlayer[];
    activePlayers: RoomPlayer[];
    leaderboard: RoomPlayer[];
  };
};

type RoomActionPayload = {
  room: RoomData["room"];
  players: RoomPlayer[];
  results: RoomData["results"];
};

type EffectTone = "green" | "red" | "amber";

async function request<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const payload = (await response.json()) as ApiResponse<T>;

  return {
    ok: response.ok,
    status: response.status,
    body: payload,
  };
}

function playerLabel(player: RoomPlayer) {
  return player.users?.display_name || player.users?.username || player.user_id.slice(0, 6);
}

function hashValue(input: string) {
  return [...input].reduce((total, char) => total + char.charCodeAt(0), 0);
}

function avatarPalette(seed: string) {
  const base = hashValue(seed);
  const palettes = [
    { skin: "#f2c38b", suit: "#ff5d73", accent: "#3c1f2b" },
    { skin: "#f6d59c", suit: "#53c7b6", accent: "#112b2f" },
    { skin: "#e9b681", suit: "#f3cd3d", accent: "#503b0f" },
    { skin: "#dca16f", suit: "#7da6ff", accent: "#1d2752" },
  ];

  return palettes[base % palettes.length];
}

function pixelSprite(seed: string) {
  const { skin, suit, accent } = avatarPalette(seed);
  const transparent = "transparent";

  return [
    [transparent, transparent, accent, accent, accent, accent, transparent, transparent],
    [transparent, accent, skin, skin, skin, skin, accent, transparent],
    [transparent, accent, skin, accent, accent, skin, accent, transparent],
    [transparent, accent, skin, skin, skin, skin, accent, transparent],
    [transparent, transparent, suit, suit, suit, suit, transparent, transparent],
    [transparent, suit, suit, suit, suit, suit, suit, transparent],
    [transparent, suit, accent, suit, suit, accent, suit, transparent],
    [transparent, accent, transparent, transparent, transparent, transparent, accent, transparent],
  ];
}

function PixelAvatar({
  seed,
  flagged,
  eliminated,
  finished,
  active,
}: {
  seed: string;
  flagged?: boolean;
  eliminated: boolean;
  finished: boolean;
  active: boolean;
}) {
  const sprite = pixelSprite(seed);

  return (
    <div className="relative">
      <div
        className={`grid grid-cols-8 gap-px rounded-[6px] border border-black/35 bg-black/20 p-1 shadow-[0_8px_18px_rgba(0,0,0,0.35)] transition ${
          eliminated ? "opacity-45 grayscale" : finished ? "scale-105" : active ? "scale-105" : ""
        }`}
      >
        {sprite.flat().map((color, index) => (
          <span
            key={index}
            className="h-2.5 w-2.5"
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
      {flagged && !eliminated ? (
        <span className="absolute -right-2 -top-2 rounded-full border border-amber-200/60 bg-amber-300 px-1.5 py-0.5 text-[9px] font-bold tracking-[0.2em] text-[#2f1a00]">
          !
        </span>
      ) : null}
      {finished ? (
        <span className="absolute -left-2 -top-2 rounded-full border border-emerald-200/50 bg-emerald-300 px-1.5 py-0.5 text-[9px] font-bold tracking-[0.18em] text-[#0c2a1b]">
          WIN
        </span>
      ) : null}
      {active ? (
        <span className="absolute inset-0 rounded-[8px] border-2 border-white/60" />
      ) : null}
    </div>
  );
}

export function PlayRoomClient({ roomId }: { roomId: string }) {
  const [roomData, setRoomData] = useState<RoomData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string>("");
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [moveUserId, setMoveUserId] = useState<string>("");
  const [step, setStep] = useState<string>("1");
  const [effectText, setEffectText] = useState<string>("");
  const [effectTone, setEffectTone] = useState<EffectTone>("green");
  const [signalFlash, setSignalFlash] = useState<"GREEN" | "RED" | null>(null);
  const [shotTargetId, setShotTargetId] = useState<string | null>(null);
  const [lastActionAt, setLastActionAt] = useState<string>("");

  const previousSignalRef = useRef<string | null>(null);
  const eliminatedIdsRef = useRef<Set<string>>(new Set());
  const effectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const signalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerEffect = useEffectEvent((text: string, tone: EffectTone) => {
    if (effectTimerRef.current) {
      clearTimeout(effectTimerRef.current);
    }

    setEffectText(text);
    setEffectTone(tone);
    effectTimerRef.current = setTimeout(() => {
      setEffectText("");
    }, 1200);
  });

  const flashSignal = useEffectEvent((signal: "GREEN" | "RED") => {
    if (signalTimerRef.current) {
      clearTimeout(signalTimerRef.current);
    }

    setSignalFlash(signal);
    signalTimerRef.current = setTimeout(() => {
      setSignalFlash(null);
    }, 650);
  });

  const markShot = useEffectEvent((targetUserId: string) => {
    if (shotTimerRef.current) {
      clearTimeout(shotTimerRef.current);
    }

    setShotTargetId(targetUserId);
    shotTimerRef.current = setTimeout(() => {
      setShotTargetId(null);
    }, 900);
  });

  const syncRoomData = useEffectEvent((payload: RoomData) => {
    const previousSignal = previousSignalRef.current;
    const nextSignal = payload.room.signalState;
    const eliminatedIds = new Set(
      payload.players.filter((player) => player.eliminated).map((player) => player.user_id)
    );

    if (previousSignal && previousSignal !== nextSignal) {
      flashSignal(nextSignal as "GREEN" | "RED");
      triggerEffect(nextSignal === "GREEN" ? "GREEN LIGHT" : "RED LIGHT", nextSignal === "GREEN" ? "green" : "red");
    }

    const newlyEliminated = payload.players.find(
      (player) => player.eliminated && !eliminatedIdsRef.current.has(player.user_id)
    );

    if (newlyEliminated) {
      markShot(newlyEliminated.user_id);
      triggerEffect(`${playerLabel(newlyEliminated)} OUT`, "red");
    }

    if (payload.results.winner) {
      triggerEffect(`${playerLabel(payload.results.winner)} WIN`, "green");
    }

    previousSignalRef.current = nextSignal;
    eliminatedIdsRef.current = eliminatedIds;

    startTransition(() => {
      setRoomData(payload);
      setLastUpdated(new Date().toLocaleTimeString("ko-KR", { hour12: false }));
      setError(null);
    });
  });

  const fetchRoom = useEffectEvent(async () => {
    try {
      const { ok, body } = await request<RoomData>(`/api/rooms/${roomId}`, {
        cache: "no-store",
      });

      if (!ok || !body.data) {
        setError(body.error ?? "방 정보를 불러오지 못했습니다.");
        return;
      }

      syncRoomData(body.data);
    } catch {
      setError("방 상태를 불러오는 중 오류가 발생했습니다.");
    }
  });

  useEffect(() => {
    fetchRoom();

    const roomChannel = supabase
      .channel(`room-${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
        () => {
          void fetchRoom();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_players", filter: `room_id=eq.${roomId}` },
        () => {
          void fetchRoom();
        }
      )
      .subscribe();

    const fallbackInterval = window.setInterval(() => {
      void fetchRoom();
    }, 5000);

    return () => {
      clearInterval(fallbackInterval);
      void supabase.removeChannel(roomChannel);

      if (effectTimerRef.current) {
        clearTimeout(effectTimerRef.current);
      }
      if (signalTimerRef.current) {
        clearTimeout(signalTimerRef.current);
      }
      if (shotTimerRef.current) {
        clearTimeout(shotTimerRef.current);
      }
    };
  }, [fetchRoom, roomId]);

  const leaderboard = roomData?.results.leaderboard ?? [];
  const finishDistance = roomData?.room.finish_distance ?? 1;
  const hostUserId = roomData?.room.host_user_id ?? "";
  const movablePlayers = useMemo(
    () => roomData?.players.filter((player) => !player.eliminated && !player.finished) ?? [],
    [roomData?.players]
  );
  const selectedPlayer = movablePlayers.find((player) => player.user_id === moveUserId) ?? movablePlayers[0] ?? null;

  useEffect(() => {
    if (!selectedPlayer) {
      if (moveUserId) {
        setMoveUserId("");
      }
      return;
    }

    if (!moveUserId || !movablePlayers.some((player) => player.user_id === moveUserId)) {
      setMoveUserId(selectedPlayer.user_id);
    }
  }, [moveUserId, movablePlayers, selectedPlayer]);

  const runAction = async (label: string, url: string, init?: RequestInit) => {
    try {
      const result = await request<RoomActionPayload>(url, init);

      if (!result.ok || !result.body.data) {
        setActionMessage(`${label}: ${result.body.error ?? "요청 실패"}`);
        return;
      }

      const payload = result.body.data;
      syncRoomData({
        room: payload.room,
        players: payload.players,
        results: payload.results,
      });

      setActionMessage(`${label}: 완료`);
      setLastActionAt(new Date().toLocaleTimeString("ko-KR", { hour12: false }));
    } catch {
      setActionMessage(`${label}: 요청 중 오류 발생`);
    }
  };

  const startGame = async () => {
    if (!hostUserId) {
      setActionMessage("게임 시작: 방장 정보가 없습니다.");
      return;
    }

    await runAction("게임 시작", `/api/rooms/${roomId}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hostUserId }),
    });
  };

  const toggleSignal = async (signal?: "GREEN" | "RED") => {
    if (!hostUserId) {
      setActionMessage("신호 변경: 방장 정보가 없습니다.");
      return;
    }

    await runAction("신호 변경", `/api/rooms/${roomId}/signal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hostUserId, signal }),
    });
  };

  const movePlayer = async (overrideUserId?: string, overrideStep?: number) => {
    const targetUserId = overrideUserId ?? moveUserId;
    const nextStep = overrideStep ?? Number(step);

    if (!targetUserId) {
      setActionMessage("이동: 플레이어를 선택하세요.");
      return;
    }

    await runAction("이동", `/api/rooms/${roomId}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: targetUserId,
        step: nextStep,
      }),
    });
  };

  const shootPlayer = async (targetUserId: string) => {
    if (!hostUserId) {
      setActionMessage("저격: 방장 정보가 없습니다.");
      return;
    }

    await runAction("저격", `/api/rooms/${roomId}/shoot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hostUserId,
        targetUserId,
      }),
    });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLSelectElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (event.key === "ArrowUp" || event.key.toLowerCase() === "w") {
        event.preventDefault();
        const currentIndex = movablePlayers.findIndex((player) => player.user_id === selectedPlayer?.user_id);
        const nextIndex = currentIndex <= 0 ? movablePlayers.length - 1 : currentIndex - 1;
        if (movablePlayers[nextIndex]) {
          setMoveUserId(movablePlayers[nextIndex].user_id);
        }
        return;
      }

      if (event.key === "ArrowDown" || event.key.toLowerCase() === "s") {
        event.preventDefault();
        const currentIndex = movablePlayers.findIndex((player) => player.user_id === selectedPlayer?.user_id);
        const nextIndex = currentIndex >= movablePlayers.length - 1 ? 0 : currentIndex + 1;
        if (movablePlayers[nextIndex]) {
          setMoveUserId(movablePlayers[nextIndex].user_id);
        }
        return;
      }

      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        void movePlayer();
        return;
      }

      if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        void toggleSignal("RED");
        return;
      }

      if (event.key.toLowerCase() === "g") {
        event.preventDefault();
        void toggleSignal("GREEN");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [movablePlayers, moveUserId, selectedPlayer]);

  return (
    <main className="min-h-screen overflow-hidden bg-[#efe4bf] text-[#1c160f]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.45),transparent_30%),linear-gradient(180deg,#f7efc8_0%,#e6d38e_45%,#b57d43_46%,#8f5b33_100%)]" />
      <div
        className={`pointer-events-none absolute inset-0 transition-opacity duration-300 ${
          signalFlash === "GREEN"
            ? "bg-[radial-gradient(circle,rgba(105,239,110,0.28),transparent_55%)] opacity-100"
            : signalFlash === "RED"
              ? "bg-[radial-gradient(circle,rgba(255,75,75,0.24),transparent_55%)] opacity-100"
              : "opacity-0"
        }`}
      />
      {effectText ? (
        <div className="pointer-events-none absolute inset-x-0 top-10 z-40 flex justify-center">
          <div
            className={`rounded-[22px] border-[4px] px-6 py-3 text-xl font-black uppercase tracking-[0.16em] shadow-[0_12px_0_rgba(70,40,20,0.35)] ${
              effectTone === "green"
                ? "border-[#1d6d2f] bg-[#baf28f] text-[#174220]"
                : effectTone === "red"
                  ? "border-[#8a251f] bg-[#ffb4a6] text-[#581d17]"
                  : "border-[#815c12] bg-[#f7da77] text-[#4e3400]"
            }`}
          >
            {effectText}
          </div>
        </div>
      ) : null}
      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-4 py-6">
        <header className="rounded-[28px] border-[3px] border-[#3a2413] bg-[#f5e1b8] p-5 shadow-[0_18px_0_#5d3921]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-[#8d4e2f]">
                Telegram Kukoro Play View
              </p>
              <h1 className="mt-2 text-3xl font-black uppercase tracking-[0.04em] text-[#26180f]">
                {roomData?.room.title ?? "Room Loading"}
              </h1>
              <p className="mt-2 text-sm font-semibold text-[#6a472d]">Room ID: {roomId}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <StatusBadge label="STATE" value={roomData?.room.status ?? "..."} tone="dark" />
              <StatusBadge
                label="SIGNAL"
                value={roomData?.room.signalState ?? "..."}
                tone={roomData?.room.signalState === "RED" ? "red" : "green"}
              />
              <StatusBadge label="UPDATED" value={lastUpdated || "--:--:--"} tone="light" />
              <Link
                href="/"
                className="rounded-full border-[3px] border-[#3a2413] bg-[#fff7dc] px-4 py-2 text-sm font-black uppercase tracking-[0.08em] text-[#2f1d11] shadow-[0_6px_0_#5d3921]"
              >
                Console
              </Link>
            </div>
          </div>
        </header>

        {error ? (
          <section className="rounded-[24px] border-[3px] border-[#4a1f18] bg-[#ffded3] p-5 text-sm font-bold text-[#722f22] shadow-[0_14px_0_#7a4335]">
            {error}
          </section>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-[1.5fr_0.9fr]">
          <div className="rounded-[30px] border-[4px] border-[#3a2413] bg-[#86c16b] p-4 shadow-[0_18px_0_#5d3921]">
            <div className="relative overflow-hidden rounded-[22px] border-[4px] border-[#2b5a2f] bg-[linear-gradient(180deg,#a6df83_0%,#86c16b_100%)] p-4">
              <div className="absolute inset-x-0 top-0 h-24 bg-[linear-gradient(180deg,rgba(255,255,255,0.35),transparent)]" />
              <div className="relative h-[560px] rounded-[18px] border-[4px] border-[#245026] bg-[linear-gradient(180deg,#98d372_0%,#75b25b_100%)] p-4">
                <div className="absolute inset-x-6 top-4 flex items-center justify-between text-xs font-black uppercase tracking-[0.2em] text-[#173919]">
                  <span>Start</span>
                  <span>Finish</span>
                </div>
                <div className="absolute bottom-0 left-[5%] top-0 w-[5px] bg-[#f8f6e7]" />
                <div className="absolute bottom-0 right-[8%] top-0 w-4 bg-[repeating-linear-gradient(180deg,#fff7dc_0_16px,#d43d3d_16px_32px)]" />
                <SignalLamp signalState={roomData?.room.signalState ?? "GREEN"} />

                <div className="relative flex h-full flex-col justify-evenly pt-12">
                  {leaderboard.length === 0 ? (
                    <div className="rounded-[18px] border-[3px] border-dashed border-[#2e5f30] bg-white/20 px-4 py-6 text-center text-sm font-bold text-[#204624]">
                      플레이어가 아직 없습니다.
                    </div>
                  ) : (
                    leaderboard.map((player, index) => {
                      const progressRatio = Math.min(player.position / finishDistance, 1);
                      const left = `calc(7% + ${progressRatio * 80}%)`;
                      const isSelected = player.user_id === selectedPlayer?.user_id;
                      const isShotTarget = shotTargetId === player.user_id;

                      return (
                        <div
                          key={player.id}
                          className={`relative h-20 rounded-[18px] border-[3px] border-[#54853f] bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.04))] ${
                            isSelected ? "ring-4 ring-white/35" : ""
                          }`}
                        >
                          <div className="absolute inset-y-1 left-3 w-[calc(100%-1.5rem)] border-y border-dashed border-white/30" />
                          {isShotTarget ? (
                            <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.9)_45%,rgba(255,82,82,0.8)_50%,transparent_55%)]" />
                          ) : null}
                          <div
                            className="absolute top-1/2 -translate-y-1/2 transition-all duration-500"
                            style={{ left }}
                          >
                            <div className="flex items-center gap-3">
                              <PixelAvatar
                                seed={player.user_id}
                                flagged={player.flagged_on_red}
                                eliminated={player.eliminated}
                                finished={player.finished}
                                active={isSelected}
                              />
                              <div className="min-w-0 rounded-[16px] border-[3px] border-[#362012] bg-[#fbe7c0] px-3 py-2 shadow-[0_8px_0_#6b4226]">
                                <div className="max-w-32 truncate text-sm font-black uppercase text-[#29170c]">
                                  {index + 1}. {playerLabel(player)}
                                </div>
                                <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[#7a5235]">
                                  POS {player.position}/{finishDistance} · VIO {player.violations}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>

          <aside className="grid gap-4">
            <Panel title="Match">
              <InfoRow label="Players" value={String(roomData?.players.length ?? 0)} />
              <InfoRow
                label="Winner"
                value={roomData?.results.winner ? playerLabel(roomData.results.winner) : "-"}
              />
              <InfoRow
                label="Auto Eliminate"
                value={roomData?.room.auto_eliminate_on_red_move ? "ON" : "OFF"}
              />
              <InfoRow
                label="Flagged"
                value={String(roomData?.players.filter((player) => player.flagged_on_red).length ?? 0)}
              />
            </Panel>

            <Panel title="Controls">
              <InfoRow
                label="Host"
                value={
                  hostUserId
                    ? playerLabel(
                        roomData?.players.find((player) => player.user_id === hostUserId) ?? {
                          id: hostUserId,
                          user_id: hostUserId,
                          position: 0,
                          violations: 0,
                          eliminated: false,
                          finished: false,
                        }
                      )
                    : "-"
                }
              />
              <div className="grid gap-3">
                <ArcadeButton onClick={startGame}>게임 시작</ArcadeButton>
                <div className="grid grid-cols-3 gap-2">
                  <ArcadeButton onClick={() => toggleSignal()} compact>
                    토글
                  </ArcadeButton>
                  <ArcadeButton onClick={() => toggleSignal("GREEN")} compact>
                    GREEN
                  </ArcadeButton>
                  <ArcadeButton onClick={() => toggleSignal("RED")} compact>
                    RED
                  </ArcadeButton>
                </div>
              </div>
              <label className="grid gap-2">
                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-[#8a5b3a]">
                  Move Player
                </span>
                <select
                  value={selectedPlayer?.user_id ?? ""}
                  onChange={(event) => setMoveUserId(event.target.value)}
                  className="rounded-[16px] border-[3px] border-[#4a2d19] bg-[#fff5d9] px-4 py-3 text-sm font-bold text-[#2d1a10] outline-none"
                >
                  {movablePlayers.map((player) => (
                    <option key={player.id} value={player.user_id}>
                      {playerLabel(player)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2">
                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-[#8a5b3a]">
                  Step
                </span>
                <input
                  value={step}
                  onChange={(event) => setStep(event.target.value)}
                  className="rounded-[16px] border-[3px] border-[#4a2d19] bg-[#fff5d9] px-4 py-3 text-sm font-bold text-[#2d1a10] outline-none"
                />
              </label>
              <ArcadeButton onClick={() => void movePlayer()}>선택 플레이어 이동</ArcadeButton>
              <div className="grid grid-cols-3 gap-2">
                <ArcadeButton onClick={() => void movePlayer(selectedPlayer?.user_id, 1)} compact>
                  +1
                </ArcadeButton>
                <ArcadeButton onClick={() => void movePlayer(selectedPlayer?.user_id, 2)} compact>
                  +2
                </ArcadeButton>
                <ArcadeButton onClick={() => void movePlayer(selectedPlayer?.user_id, 3)} compact>
                  +3
                </ArcadeButton>
              </div>
              <div className="rounded-[16px] border-[3px] border-[#4a2d19] bg-[#fff5d9] px-4 py-3 text-sm font-bold text-[#2d1a10]">
                <div>{actionMessage || "아직 실행한 액션이 없습니다."}</div>
                <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-[#8a5b3a]">
                  Last Action {lastActionAt || "--:--:--"}
                </div>
              </div>
            </Panel>

            <Panel title="Input Guide">
              <LegendItem swatch="bg-[#7dd35e]" label="Space / Enter: 선택 플레이어 이동" />
              <LegendItem swatch="bg-[#c6f5b7]" label="W / ArrowUp, S / ArrowDown: 플레이어 선택" />
              <LegendItem swatch="bg-[#ffb4a6]" label="R: RED, G: GREEN" />
            </Panel>

            <Panel title="Live Feed">
              <div className="grid gap-3">
                {leaderboard.map((player) => (
                  <div
                    key={player.id}
                    className={`rounded-[18px] border-[3px] px-4 py-3 text-sm font-bold shadow-[0_8px_0_rgba(70,40,20,0.35)] ${
                      player.finished
                        ? "border-[#1f6a42] bg-[#c6f5b7] text-[#123723]"
                        : player.eliminated
                          ? "border-[#6e3126] bg-[#f3b3a6] text-[#4d1f18]"
                          : player.flagged_on_red
                            ? "border-[#815c12] bg-[#f7da77] text-[#4e3400]"
                            : "border-[#4a2d19] bg-[#f7e3ba] text-[#372114]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate">{playerLabel(player)}</span>
                      <span>{player.status ?? "ALIVE"}</span>
                    </div>
                    {roomData?.room.signalState === "RED" &&
                    player.flagged_on_red &&
                    !player.eliminated &&
                    !player.finished &&
                    player.user_id !== hostUserId ? (
                      <div className="mt-3">
                        <ArcadeButton onClick={() => void shootPlayer(player.user_id)} compact>
                          저격
                        </ArcadeButton>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Legend">
              <LegendItem swatch="bg-[#7dd35e]" label="GREEN에서는 이동 가능" />
              <LegendItem swatch="bg-[#d44848]" label="RED에서는 이동 시 적발" />
              <LegendItem swatch="bg-[#f7da77]" label="! 표시 플레이어는 이번 RED에서 저격 가능" />
            </Panel>
          </aside>
        </section>
      </div>
    </main>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[24px] border-[4px] border-[#3a2413] bg-[#f6e0b2] p-4 shadow-[0_14px_0_#5d3921]">
      <h2 className="text-sm font-black uppercase tracking-[0.18em] text-[#26180f]">{title}</h2>
      <div className="mt-4 grid gap-3">{children}</div>
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[16px] border-[3px] border-[#4a2d19] bg-[#fff5d9] px-4 py-3 text-sm font-bold text-[#2d1a10]">
      <span className="uppercase tracking-[0.14em] text-[#8a5b3a]">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function StatusBadge({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "green" | "red" | "dark" | "light";
}) {
  const toneClass =
    tone === "green"
      ? "border-[#1d6d2f] bg-[#baf28f] text-[#18431f]"
      : tone === "red"
        ? "border-[#8a251f] bg-[#ffb4a6] text-[#581d17]"
        : tone === "dark"
          ? "border-[#3a2413] bg-[#6c4226] text-[#fff2d8]"
          : "border-[#4a2d19] bg-[#fff5d9] text-[#2e1b11]";

  return (
    <div className={`rounded-[18px] border-[3px] px-4 py-2 shadow-[0_8px_0_rgba(70,40,20,0.35)] ${toneClass}`}>
      <div className="text-[10px] font-black uppercase tracking-[0.22em]">{label}</div>
      <div className="mt-1 text-sm font-black uppercase">{value}</div>
    </div>
  );
}

function SignalLamp({ signalState }: { signalState: string }) {
  return (
    <div className="absolute right-6 top-8 z-10 rounded-[20px] border-[4px] border-[#331f12] bg-[#ffe7be] px-4 py-3 shadow-[0_10px_0_#5d3921]">
      <div className="flex items-center gap-3">
        <Light active={signalState === "RED"} color="red" />
        <Light active={signalState === "GREEN"} color="green" />
      </div>
    </div>
  );
}

function Light({ active, color }: { active: boolean; color: "red" | "green" }) {
  const className =
    color === "red"
      ? active
        ? "bg-[#ff4b4b] shadow-[0_0_20px_rgba(255,75,75,0.85)]"
        : "bg-[#6e2828]"
      : active
        ? "bg-[#68ef6e] shadow-[0_0_20px_rgba(104,239,110,0.85)]"
        : "bg-[#28582d]";

  return <span className={`inline-flex h-7 w-7 rounded-full border-[3px] border-[#23140b] ${className}`} />;
}

function LegendItem({ swatch, label }: { swatch: string; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[16px] border-[3px] border-[#4a2d19] bg-[#fff5d9] px-4 py-3 text-sm font-bold text-[#2d1a10]">
      <span className={`inline-flex h-4 w-4 rounded-sm border-2 border-[#2d1a10] ${swatch}`} />
      <span>{label}</span>
    </div>
  );
}

function ArcadeButton({
  children,
  onClick,
  compact = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-[18px] border-[3px] border-[#3a2413] bg-[#ffcf57] font-black uppercase tracking-[0.08em] text-[#2f1d11] shadow-[0_8px_0_#7e5720] transition hover:bg-[#ffd978] active:translate-y-[2px] active:shadow-[0_6px_0_#7e5720] ${
        compact ? "px-3 py-2 text-xs" : "px-4 py-3 text-sm"
      }`}
    >
      {children}
    </button>
  );
}
