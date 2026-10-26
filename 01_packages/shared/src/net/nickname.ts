/**
 * Nickname rules, shared by the client (instant feedback while typing) and the server (the only
 * authority, it checks again and keeps names unique). See 01_docs/multiplayer.md#nicknames.
 */
export const NICKNAME_RULES = { minLength: 3, maxLength: 16 } as const;

/** Letters of any language, digits, space, `_` and `-`. */
const ALLOWED = /^[\p{L}0-9 _-]+$/u;

export type NicknameProblem = 'tooShort' | 'tooLong' | 'badChars';

export type NicknameCheck =
  | { readonly ok: true; readonly nickname: string }
  | { readonly ok: false; readonly reason: NicknameProblem };

/** The nickname as it will be shown: Unicode-normalized, trimmed, inner spaces collapsed to one. */
export function normalizeNickname(raw: string): string {
  return raw.normalize('NFC').trim().replace(/ {2,}/g, ' ');
}

/** Checks `raw` against the rules; on success returns the normalized nickname. */
export function checkNickname(raw: string): NicknameCheck {
  const nickname = normalizeNickname(raw);
  const length = [...nickname].length; // code points, so "é" counts once
  if (length < NICKNAME_RULES.minLength) return { ok: false, reason: 'tooShort' };
  if (length > NICKNAME_RULES.maxLength) return { ok: false, reason: 'tooLong' };
  if (!ALLOWED.test(nickname)) return { ok: false, reason: 'badChars' };
  return { ok: true, nickname };
}

/** Identity for uniqueness: "Enea", "enea" and " ENEA " are the same player name. */
export function nicknameKey(nickname: string): string {
  return normalizeNickname(nickname).toLocaleLowerCase('en');
}
