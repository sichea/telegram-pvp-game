import { createHmac } from "crypto";
import { supabase } from "@/lib/supabase";
import { UserRow } from "@/types/game";

export type TelegramWebAppUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  photo_url?: string;
};

function buildDataCheckString(initData: string) {
  const params = new URLSearchParams(initData);
  const pairs: string[] = [];

  for (const [key, value] of params.entries()) {
    if (key === "hash") {
      continue;
    }

    pairs.push(`${key}=${value}`);
  }

  return pairs.sort().join("\n");
}

export function verifyTelegramInitData(initData: string, botToken: string) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");

  if (!hash) {
    return { ok: false as const, error: "Telegram initData에 hash가 없습니다." };
  }

  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const dataCheckString = buildDataCheckString(initData);
  const calculatedHash = createHmac("sha256", secret).update(dataCheckString).digest("hex");

  if (calculatedHash !== hash) {
    return { ok: false as const, error: "Telegram initData 검증에 실패했습니다." };
  }

  return { ok: true as const, params };
}

export function parseTelegramUser(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as TelegramWebAppUser;
  } catch {
    return null;
  }
}

export function buildTelegramDisplayName(user: TelegramWebAppUser) {
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return fullName || user.username || `tg_${user.id}`;
}

export async function resolveTelegramSession(request: Request) {
  const initData = request.headers.get("x-telegram-init-data")?.trim();
  if (!initData) {
    return { user: null, error: null as string | null };
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return {
      user: null,
      error: "서버에 TELEGRAM_BOT_TOKEN이 설정되지 않아 Telegram 인증을 확인할 수 없습니다.",
    };
  }

  const verification = verifyTelegramInitData(initData, botToken);
  if (!verification.ok) {
    return { user: null, error: verification.error };
  }

  const telegramUser = parseTelegramUser(verification.params.get("user"));
  if (!telegramUser?.id) {
    return { user: null, error: "Telegram 사용자 정보를 찾을 수 없습니다." };
  }

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("telegram_user_id", telegramUser.id)
    .maybeSingle<UserRow>();

  if (error) {
    return { user: null, error: error.message };
  }

  if (!data) {
    return { user: null, error: "Telegram 세션에 연결된 유저가 없습니다." };
  }

  return { user: data, error: null as string | null };
}
