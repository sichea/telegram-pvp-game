const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.trim() || "";

export function getTelegramBotUsername() {
  return botUsername;
}

export function buildTelegramBotLink(roomId?: string) {
  if (!botUsername) {
    return null;
  }

  const payload = roomId ? `room_${roomId}` : "lobby";
  return `https://t.me/${botUsername}?startapp=${encodeURIComponent(payload)}`;
}
