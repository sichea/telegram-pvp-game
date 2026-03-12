import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { apiError, apiSuccess } from "@/lib/rooms";
import {
  buildTelegramDisplayName,
  parseTelegramUser,
  verifyTelegramInitData,
} from "@/lib/telegram";

type TelegramSessionRequest = {
  initData?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as TelegramSessionRequest;
    const initData = body.initData?.trim();
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    if (!initData) {
      return apiError("Telegram initData가 필요합니다.", 400);
    }

    if (!botToken) {
      return apiError("서버에 TELEGRAM_BOT_TOKEN이 설정되지 않았습니다.", 500);
    }

    const verification = verifyTelegramInitData(initData, botToken);
    if (!verification.ok) {
      return apiError(verification.error, 401);
    }

    const telegramUser = parseTelegramUser(verification.params.get("user"));
    if (!telegramUser?.id) {
      return apiError("Telegram 사용자 정보를 찾을 수 없습니다.", 400);
    }

    const payload = {
      telegram_user_id: telegramUser.id,
      username: telegramUser.username?.trim() || null,
      display_name: buildTelegramDisplayName(telegramUser),
      profile_image_url: telegramUser.photo_url?.trim() || null,
    };

    const { data: existingUser, error: selectError } = await supabase
      .from("users")
      .select("*")
      .eq("telegram_user_id", telegramUser.id)
      .maybeSingle();

    if (selectError) {
      return apiError(selectError.message, 500);
    }

    if (existingUser) {
      const { data: updatedUser, error: updateError } = await supabase
        .from("users")
        .update(payload)
        .eq("id", existingUser.id)
        .select("*")
        .single();

      if (updateError) {
        return apiError(updateError.message, 500);
      }

      return apiSuccess({ user: updatedUser, created: false });
    }

    const { data, error } = await supabase.from("users").insert(payload).select("*").single();

    if (error) {
      return apiError(error.message, 500);
    }

    return apiSuccess({ user: data, created: true }, 201);
  } catch {
    return apiError("잘못된 요청 본문입니다.", 400);
  }
}
