import { describe, expect, it } from 'vitest';
import { createGame } from '../sim/game';
import { buildTrack } from '../track/buildTrack';
import { TEST_TRACK } from '../track/layouts/testTrack';
import { NEUTRAL_INPUT } from '../types/input';
import {
  encodeMessage,
  parseClientMessage,
  parseServerMessage,
  PROTOCOL_VERSION,
  type ClientMessage,
  type ServerMessage,
} from './protocol';

const INPUT = { throttle: 1, brake: 0, reverse: 0, steer: -0.5, reset: false };

describe('client messages', () => {
  it('survive an encode → parse round trip', () => {
    const messages: ClientMessage[] = [
      { type: 'hello', protocol: PROTOCOL_VERSION, nickname: 'Enea' },
      { type: 'enter', track: 'Monza' },
      { type: 'input', seq: 0, input: INPUT },
      { type: 'input', seq: 12345, input: INPUT },
      { type: 'ping', t: 1234.5 },
    ];
    for (const message of messages) {
      expect(parseClientMessage(encodeMessage(message))).toEqual(message);
    }
  });

  it('reject malformed data', () => {
    const bad = [
      'not json',
      '',
      'null',
      '[]',
      '42',
      '{"type":"nope"}',
      '{"type":"hello","nickname":"Enea"}',
      '{"type":"hello","protocol":"1","nickname":"Enea"}',
      '{"type":"hello","protocol":1,"nickname":7}',
      `{"type":"hello","protocol":1,"nickname":"${'a'.repeat(65)}"}`,
      '{"type":"enter"}',
      '{"type":"enter","track":7}',
      `{"type":"enter","track":"${'a'.repeat(65)}"}`,
      '{"type":"input"}',
      '{"type":"input","seq":1,"input":{"throttle":1,"brake":0,"reverse":0,"steer":0}}',
      '{"type":"input","seq":1,"input":{"throttle":"1","brake":0,"reverse":0,"steer":0,"reset":false}}',
      '{"type":"input","seq":1,"input":{"throttle":1,"brake":0,"reverse":0,"steer":0,"reset":"no"}}',
      '{"type":"input","seq":1,"input":{"throttle":1e999,"brake":0,"reverse":0,"steer":0,"reset":false}}',
      '{"type":"input","input":{"throttle":1,"brake":0,"reverse":0,"steer":0,"reset":false}}',
      '{"type":"input","seq":-1,"input":{"throttle":1,"brake":0,"reverse":0,"steer":0,"reset":false}}',
      '{"type":"input","seq":1.5,"input":{"throttle":1,"brake":0,"reverse":0,"steer":0,"reset":false}}',
      '{"type":"input","seq":"1","input":{"throttle":1,"brake":0,"reverse":0,"steer":0,"reset":false}}',
      '{"type":"ping"}',
      '{"type":"ping","t":"now"}',
    ];
    for (const raw of bad) expect(parseClientMessage(raw)).toBeNull();
  });

  it('clamp input values to their range', () => {
    const raw = encodeMessage({
      type: 'input',
      seq: 3,
      input: { throttle: 5, brake: -1, reverse: 0.5, steer: -9, reset: true },
    });
    expect(parseClientMessage(raw)).toEqual({
      type: 'input',
      seq: 3,
      input: { throttle: 1, brake: 0, reverse: 0.5, steer: -1, reset: true },
    });
  });

  it('keep only the known fields', () => {
    const raw = JSON.stringify({
      type: 'input',
      seq: 0,
      extra: 1,
      input: { ...NEUTRAL_INPUT, teleport: true },
    });
    expect(parseClientMessage(raw)).toEqual({ type: 'input', seq: 0, input: NEUTRAL_INPUT });
  });
});

describe('server messages', () => {
  it('survive an encode → parse round trip', () => {
    const players = [{ id: 'p1', nickname: 'Enea', livery: 0 }];
    const messages: ServerMessage[] = [
      { type: 'welcome', playerId: 'p1', rooms: [{ track: 'Monza', players: 2 }] },
      { type: 'entered', track: 'Monza', players },
      { type: 'rejected', reason: 'taken' },
      { type: 'players', players },
      {
        type: 'snapshot',
        state: createGame(buildTrack(TEST_TRACK), ['p1', 'p2']),
        acks: { p1: 41 },
      },
      { type: 'pong', t: 1234.5 },
    ];
    for (const message of messages) {
      expect(parseServerMessage(encodeMessage(message))).toEqual(message);
    }
  });

  it('ignore garbage and unknown types', () => {
    for (const raw of ['not json', 'null', '{"type":"hello"}', '[1]']) {
      expect(parseServerMessage(raw)).toBeNull();
    }
  });
});
