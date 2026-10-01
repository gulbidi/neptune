/** Matches the `chats.title` check constraint. */
export const TITLE_MAX = 200;

/**
 * Tidies a typed chat name. An empty name clears the title, so the chat goes back to
 * "New chat" and the next message names it again.
 */
export function cleanTitle(input: string): string | null {
  const title = input.replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX).trim();
  return title || null;
}
