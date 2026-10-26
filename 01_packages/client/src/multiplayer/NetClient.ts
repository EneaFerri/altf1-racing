import {
  encodeMessage,
  parseServerMessage,
  type ClientMessage,
  type ServerMessage,
} from '@altf1/shared';

/** Give up connecting after this long (ms). */
const CONNECT_TIMEOUT_MS = 5000;

/** The game's end of the multiplayer socket: typed messages in and out. */
export class NetClient {
  private socket: WebSocket | null = null;
  private messageHandler: (message: ServerMessage) => void = () => {};
  private closeHandler: () => void = () => {};

  /** Opens the socket; rejects if the server can't be reached in time. */
  connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      const timer = setTimeout(() => {
        socket.close();
        reject(new Error('timeout'));
      }, CONNECT_TIMEOUT_MS);
      socket.addEventListener('open', () => {
        clearTimeout(timer);
        this.socket = socket;
        resolve();
      });
      socket.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error('unreachable'));
      });
      socket.addEventListener('message', (event) => {
        if (typeof event.data !== 'string') return;
        const message = parseServerMessage(event.data);
        if (message) this.messageHandler(message);
      });
      socket.addEventListener('close', () => {
        if (this.socket === socket) this.closeHandler();
        this.socket = null;
      });
    });
  }

  send(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(encodeMessage(message));
  }

  onMessage(handler: (message: ServerMessage) => void): void {
    this.messageHandler = handler;
  }

  /** Called when an open connection ends (server stopped, network lost, rejected). */
  onClose(handler: () => void): void {
    this.closeHandler = handler;
  }

  close(): void {
    this.socket?.close();
  }
}
