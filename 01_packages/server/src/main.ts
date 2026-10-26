import { TICK_RATE } from '@altf1/shared';
import { WebSocketServer, type WebSocket } from 'ws';
import { GameServer, type Connection } from './GameServer.ts';

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

const server = new GameServer((line) => console.info(line));
const sockets = new WebSocketServer({ port: PORT, path: '/ws' });
const alive = new WeakSet<WebSocket>();

sockets.on('connection', (socket) => {
  const conn: Connection = {
    send: (text) => socket.send(text),
    close: (code, reason) => socket.close(code, reason),
  };
  alive.add(socket);
  socket.on('pong', () => alive.add(socket));
  socket.on('message', (data, isBinary) => {
    if (!isBinary) server.message(conn, data.toString());
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

sockets.on('listening', () => {
  console.info(`[server] AltF1 multiplayer on ws://localhost:${PORT}/ws (Ctrl+C to stop)`);
});

process.on('SIGINT', () => {
  clearInterval(loop);
  clearInterval(heartbeat);
  for (const socket of sockets.clients) socket.close(1001, 'server stopping');
  sockets.close(() => process.exit(0));
});
