import { describe, expect, it } from 'vitest';
import { checkNickname, nicknameKey, normalizeNickname } from './nickname';

describe('checkNickname', () => {
  it('accepts letters of any language, digits, space, _ and -', () => {
    for (const name of ['Enea', 'enea_99', 'Max-V', 'Kimi R', 'Pérez', 'Hülkenberg', 'Ζήνων']) {
      expect(checkNickname(name)).toEqual({ ok: true, nickname: name });
    }
  });

  it('returns the normalized nickname: trimmed, inner spaces collapsed', () => {
    expect(checkNickname('  Kimi    R ')).toEqual({ ok: true, nickname: 'Kimi R' });
  });

  it('needs 3 to 16 characters after trimming, counting accented letters once', () => {
    expect(checkNickname('Al')).toEqual({ ok: false, reason: 'tooShort' });
    expect(checkNickname('  Al  ')).toEqual({ ok: false, reason: 'tooShort' });
    expect(checkNickname('Abc').ok).toBe(true);
    expect(checkNickname('a'.repeat(16)).ok).toBe(true);
    expect(checkNickname('a'.repeat(17))).toEqual({ ok: false, reason: 'tooLong' });
    expect(checkNickname('é'.repeat(16)).ok).toBe(true);
  });

  it('rejects anything else', () => {
    for (const name of ['<b>hi</b>', 'Enea🏎', 'tab\there', 'a.b.c', 'drop;table']) {
      expect(checkNickname(name)).toEqual({ ok: false, reason: 'badChars' });
    }
  });
});

describe('nicknameKey', () => {
  it('treats case and extra spaces as the same name', () => {
    expect(nicknameKey('Enea')).toBe(nicknameKey('enea'));
    expect(nicknameKey(' ENEA ')).toBe(nicknameKey('enea'));
    expect(nicknameKey('Kimi  R')).toBe(nicknameKey('kimi r'));
    expect(nicknameKey('Enea')).not.toBe(nicknameKey('Enea2'));
  });

  it('treats composed and decomposed accents as the same name', () => {
    expect(nicknameKey('Pérez')).toBe(nicknameKey('Pérez'));
    expect(normalizeNickname('Pérez')).toBe('Pérez');
  });
});
