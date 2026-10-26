import { describe, expect, it } from 'vitest';
import { serverUrl } from './serverUrl';

describe('serverUrl', () => {
  it('uses the page host with path /ws, secure when the page is', () => {
    expect(serverUrl({ protocol: 'http:', host: 'localhost:5173' })).toBe('ws://localhost:5173/ws');
    expect(serverUrl({ protocol: 'http:', host: '100.64.0.7:5173' })).toBe(
      'ws://100.64.0.7:5173/ws',
    );
    expect(serverUrl({ protocol: 'https:', host: 'altf1.example' })).toBe('wss://altf1.example/ws');
  });
});
