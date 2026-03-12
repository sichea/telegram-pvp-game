import { NextRequest, NextResponse } from "next/server";
import {
  isTelegramWebhookAuthorized,
  replyToTelegramStart,
  type TelegramWebhookUpdate,
} from "@/lib/telegramBot";

export async function POST(request: NextRequest) {
  if (!isTelegramWebhookAuthorized(request)) {
    return NextResponse.json(
      { success: false, error: "Invalid webhook secret." },
      { status: 401 }
    );
  }

  try {
    const update = (await request.json()) as TelegramWebhookUpdate;
    const text = update.message?.text?.trim() ?? "";

    if (text.startsWith("/start") || text.startsWith("/startapp")) {
      await replyToTelegramStart(update);
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid webhook payload." },
      { status: 400 }
    );
  }
}
