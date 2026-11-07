import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TICK_RATE } from '@altf1/shared';
import { WebSocketServer, type WebSocket } from 'ws';
import { GameServer, type Connection } from './GameServer.ts';
import { LapRecords } from './LapRecords.ts';
import { NetSim, netSimFromEnv } from './netSim.ts';

/**
 * Multiplayer server entry point: adapts `ws` sockets and real time to GameServer.
 * Start with `npm run server` (port 8787, path /ws; the client reaches it through Vite's proxy).
 * See 01_docs/multiplayer.md#server.
 */

const PORT = Number(process.env['PORT'] ?? 8787);
/** A socket that hasn't joined (accepted hello) by then is closed. */
const HELLO_TIMEOUT_MS = 10_000;
/** Every socket is pinged this often; one that didn't answer the previous ping is dropped. */
const HEARTBEAT_MS = 5_000;

/** The lap records' SQLite file (git-ignored); RECORDS_DB=… to use another. */
const RECORDS_DB =
  process.env['RECORDS_DB'] ?? fileURLToPath(new URL('../data/records.db', import.meta.url));

/** Dev only: a simulated bad network on every socket (NET_DELAY_MS, NET_JITTER_MS, NET_STALL_MS). */
const NET_SIM = netSimFromEnv(process.env);

/** Runs `deliver` when a message sent now arrives on `link` (at once without a simulated network). */
function overLink(link: NetSim | null, deliver: () => void): void {
  if (!link) return deliver();
  setTimeout(deliver, link.deliveryTime(performance.now()) - performance.now());
}

mkdirSync(dirname(RECORDS_DB), { recursive: true });
const records = new LapRecords(RECORDS_DB);
const server = new GameServer((line) => console.info(line), records);
const sockets = new WebSocketServer({ port: PORT, path: '/ws' });
const alive = new WeakSet<WebSocket>();

sockets.on('connection', (socket) => {
  const down = NET_SIM && new NetSim(NET_SIM);
  const up = NET_SIM && new NetSim(NET_SIM);
  const conn: Connection = {
    send: (text) => overLink(down, () => socket.readyState === socket.OPEN && socket.send(text)),
    close: (code, reason) => socket.close(code, reason),
  };
  alive.add(socket);
  socket.on('pong', () => alive.add(socket));
  socket.on('message', (data, isBinary) => {
    if (!isBinary) {
      const text = data.toString();
      overLink(up, () => socket.readyState === socket.OPEN && server.message(conn, text));
    }
  });
  socket.on('close', () => server.close(conn));
  socket.on('error', () => socket.terminate());
  setTimeout(() => {
    if (!server.hasJoined(conn)) socket.close(1000, 'no hello');
  }, HELLO_TIMEOUT_MS);
});

// A laptop that drops off the network never sends a close: the heartbeat frees its nickname.
const heartbeat = setInterval(() => {
  for (const socket of sockets.clients) {
    if (!alive.has(socket)) {
      socket.terminate();
      continue;
    }
    alive.delete(socket);
    socket.ping();
  }
}, HEARTBEAT_MS);

let last = performance.now();
const loop = setInterval(() => {
  const now = performance.now();
  server.advance((now - last) / 1000);
  last = now;
}, 1000 / TICK_RATE);

sockets.on('error', (error: NodeJS.ErrnoException) => {
  const reason =
    error.code === 'EADDRINUSE'
      ? `port ${PORT} is already in use: is another server running? (PORT=… to use another)`
      : error.message;
  console.error(`[server] cannot start: ${reason}`);
  process.exit(1);
});

sockets.on('listening', () => {
  console.info(`[server] AltF1 multiplayer on ws://localhost:${PORT}/ws (Ctrl+C to stop)`);
  console.info(`[server] lap records in ${RECORDS_DB}`);
  if (NET_SIM) console.info(`[server] simulated bad network: ${JSON.stringify(NET_SIM)}`);
});

process.on('SIGINT', () => {
  clearInterval(loop);
  clearInterval(heartbeat);
  records.close();
  for (const socket of sockets.clients) socket.close(1001, 'server stopping');
  sockets.close(() => process.exit(0));
});
