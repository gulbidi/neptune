/** Pure payload construction is shared with unit tests; keys never enter this module. */
export function notificationPreview(body: string) {
  const plain = body.replace(/[#*_`>]/g, '').replace(/\s+/g, ' ').trim();
  return plain.length > 180 ? `${plain.slice(0, 177)}…` : plain;
}

export function buildPushMessage(input: {
  token: string; messageId: string; chatId: string; email: string;
  title: string; body: string; createdAt: string;
}, now = Date.now()) {
  const age = now - Date.parse(input.createdAt);
  if (!Number.isFinite(age) || age > 3_600_000) return null;
  const ttl = Math.max(1, Math.min(3600, Math.ceil((3_600_000 - Math.max(0, age)) / 1000)));
  return {
    message: {
      token: input.token,
      notification: { title: input.title, body: notificationPreview(input.body) },
      data: { message_id: input.messageId, chat_id: input.chatId, account_email: input.email },
      android: {
        priority: 'HIGH', ttl: `${ttl}s`,
        notification: { channel_id: 'neptune_replies', tag: input.messageId, icon: 'ic_notification', color: '#22C55E', sound: 'default' },
      },
    },
  };
}

/** INVALID_ARGUMENT can mean a bad payload, so only UNREGISTERED deletes a device. */
export function isExpiredToken(error: unknown): boolean {
  const value = error as { error?: { details?: { errorCode?: string }[] } } | null;
  return !!value?.error?.details?.some((d) => d.errorCode === 'UNREGISTERED');
}

export const retryDelaySeconds = (attempt: number) => Math.min(900, 30 * 2 ** Math.max(0, attempt - 1));
