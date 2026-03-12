import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { apiError, apiSuccess } from "@/lib/rooms";
import { CreateUserRequest } from "@/types/game";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CreateUserRequest;

    if (
      typeof body.telegramUserId !== "number" ||
      !Number.isInteger(body.telegramUserId) ||
      !body.displayName?.trim()
    ) {
      return apiError("telegramUserId와 displayName은 필수입니다.", 400);
    }

    const { data: existingUser, error: selectError } = await supabase
      .from("users")
      .select("*")
      .eq("telegram_user_id", body.telegramUserId)
      .maybeSingle();

    if (selectError) {
      return apiError(selectError.message, 500);
    }

    if (existingUser) {
      return apiSuccess({ user: existingUser, created: false });
    }

    const { data, error } = await supabase
      .from("users")
      .insert({
        telegram_user_id: body.telegramUserId,
        username: body.username?.trim() || null,
        display_name: body.displayName.trim(),
        profile_image_url: body.profileImageUrl?.trim() || null,
      })
      .select("*")
      .single();

    if (error) {
      return apiError(error.message, 500);
    }

    return apiSuccess({ user: data, created: true }, 201);
  } catch {
    return apiError("잘못된 요청 본문입니다.", 400);
  }
}
