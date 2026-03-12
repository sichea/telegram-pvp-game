import { buildTelegramBotLink } from "@/lib/telegramLinks";

type TelegramWebhookUser = {
  id: number;
};

type TelegramWebhookChat = {
  id: number;
};

type TelegramWebhookMessage = {
  message_id: number;
  text?: string;
  from?: TelegramWebhookUser;
  chat: TelegramWebhookChat;
};

export type TelegramWebhookUpdate = {
  update_id: number;
  message?: TelegramWebhookMessage;
};

type ParsedStartPayload =
  | { type: "lobby" }
  | { type: "room"; roomId: string };

function normalizeStartToken(text: string) {
  const trimmed = text.trim();

  if (trimmed.startsWith("/startapp")) {
    return trimmed.slice("/startapp".length).trim();
  }

  if (trimmed.startsWith("/start")) {
    return trimmed.slice("/start".length).trim();
  }

  return "";
}

export function parseTelegramStartPayload(text?: string | null): ParsedStartPayload {
  const token = normalizeStartToken(text ?? "");

  if (!token || token === "lobby") {
    return { type: "lobby" };
  }

  if (token.startsWith("room_")) {
    return { type: "room", roomId: token.slice("room_".length) };
  }

  return { type: "lobby" };
}

export function getTelegramAppBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    ""
  );
}

export function buildTelegramWebAppUrl(roomId?: string) {
  const appUrl = getTelegramAppBaseUrl();
  if (!appUrl) {
    return null;
  }

  const base = appUrl.replace(/\/$/, "");
  return roomId ? `${base}/play/${roomId}` : base;
}

export async function sendTelegramMessage(chatId: number, payload: Record<string, unknown>) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN이 설정되지 않았습니다.");
  }

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      ...payload,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Telegram sendMessage 실패: ${response.status} ${text}`);
  }
}

export async function replyToTelegramStart(update: TelegramWebhookUpdate) {
  const message = update.message;
  if (!message?.chat?.id) {
    return;
  }

  const payload = parseTelegramStartPayload(message.text);
  const botLink =
    payload.type === "room" ? buildTelegramBotLink(payload.roomId) : buildTelegramBotLink();
  const webAppUrl =
    payload.type === "room"
      ? buildTelegramWebAppUrl(payload.roomId)
      : buildTelegramWebAppUrl();

  const roomText =
    payload.type === "room"
      ? `방 ${payload.roomId}로 바로 들어갈 수 있습니다.`
      : "로비에서 방을 고르거나 새 방을 만들 수 있습니다.";

  const keyboardButtons: Array<Record<string, unknown>> = [];

  if (webAppUrl) {
    keyboardButtons.push({
      text: payload.type === "room" ? "게임 열기" : "로비 열기",
      web_app: { url: webAppUrl },
    });
  }

  if (botLink) {
    keyboardButtons.push({
      text: "딥링크 복사용 열기",
      url: botLink,
    });
  }

  await sendTelegramMessage(message.chat.id, {
    text: `Kukoro Telegram MVP\n\n${roomText}`,
    reply_markup:
      keyboardButtons.length > 0
        ? {
            inline_keyboard: [keyboardButtons],
          }
        : undefined,
  });
}

export function isTelegramWebhookAuthorized(request: Request) {
  const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!configuredSecret) {
    return true;
  }

  return request.headers.get("x-telegram-bot-api-secret-token") === configuredSecret;
}
