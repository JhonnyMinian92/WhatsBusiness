import { Buffer } from "node:buffer";
import { connect as connectTcp, type Socket } from "node:net";
import { connect as connectTls, type TLSSocket } from "node:tls";
import { encodeRespCommand, parseRespResponse, RespServerError, type RespValue } from "./resp-protocol.js";

type ValkeySocket = Socket | TLSSocket;

export interface ValkeyConnectionOptions {
  readonly hostname: string;
  readonly port: number;
  readonly tls: boolean;
  readonly username?: string;
  readonly password?: string;
  readonly connectTimeoutMs: number;
  readonly commandTimeoutMs: number;
  readonly maxResponseBytes: number;
}

interface PendingCommand {
  readonly resolve: (value: RespValue) => void;
  readonly reject: (error: Error) => void;
  readonly timeout: NodeJS.Timeout;
}

export class ValkeyConnection {
  private socket: ValkeySocket | null = null;
  private connectPromise: Promise<void> | null = null;
  private input = Buffer.alloc(0);
  private pending: PendingCommand | null = null;
  private closed = false;

  constructor(private readonly options: ValkeyConnectionOptions) {}

  get isUsable(): boolean {
    return !this.closed && this.socket !== null && !this.socket.destroyed;
  }

  async connect(): Promise<void> {
    if (this.isUsable) return;
    if (this.closed) throw new Error("Valkey connection is closed.");
    if (!this.connectPromise) this.connectPromise = this.openSocket();
    try {
      await this.connectPromise;
      if (this.options.password) {
        const auth = this.options.username
          ? ["AUTH", this.options.username, this.options.password]
          : ["AUTH", this.options.password];
        const result = await this.sendCommand(auth);
        if (result !== "OK") throw new Error("Valkey authentication was rejected.");
      }
      this.connectPromise = null;
    } catch (error) {
      this.connectPromise = null;
      this.dispose(error instanceof Error ? error : new Error("Valkey connection failed."));
      throw error;
    }
  }

  async execute(argumentsList: readonly (string | Uint8Array)[]): Promise<RespValue> {
    await this.connect();
    return this.sendCommand(argumentsList);
  }

  close(): void {
    this.dispose(new Error("Valkey connection closed."));
  }

  private async openSocket(): Promise<void> {
    const socket: ValkeySocket = this.options.tls
      ? connectTls({
          host: this.options.hostname,
          port: this.options.port,
          servername: this.options.hostname,
          rejectUnauthorized: true,
        })
      : connectTcp({ host: this.options.hostname, port: this.options.port });
    this.socket = socket;
    this.input = Buffer.alloc(0);
    socket.setKeepAlive(true, 10_000);
    socket.setNoDelay(true);
    socket.on("data", (chunk: Buffer) => this.handleData(chunk));
    socket.on("error", (error: Error) => this.dispose(error));
    socket.on("close", () => this.dispose(new Error("Valkey connection closed by peer.")));

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error("Valkey connection timed out."));
      }, this.options.connectTimeoutMs);
      const readyEvent = this.options.tls ? "secureConnect" : "connect";
      socket.once(readyEvent, () => {
        clearTimeout(timer);
        resolve();
      });
      socket.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  private sendCommand(argumentsList: readonly (string | Uint8Array)[]): Promise<RespValue> {
    const socket = this.socket;
    if (!socket || socket.destroyed || this.closed) return Promise.reject(new Error("Valkey connection is not available."));
    if (this.pending) return Promise.reject(new Error("Concurrent commands on one Valkey connection are not supported."));
    const command = encodeRespCommand(argumentsList);

    return new Promise<RespValue>((resolve, reject) => {
      const timeout = setTimeout(() => this.dispose(new Error("Valkey command timed out.")), this.options.commandTimeoutMs);
      this.pending = { resolve, reject, timeout };
      socket.write(command, (error) => {
        if (error) this.dispose(error);
      });
    });
  }

  private handleData(chunk: Buffer): void {
    if (this.closed) return;
    this.input = Buffer.concat([this.input, chunk]);
    if (this.input.byteLength > this.options.maxResponseBytes) {
      this.dispose(new Error("Valkey response exceeds the configured size limit."));
      return;
    }
    if (!this.pending) return;
    try {
      const response = parseRespResponse(this.input);
      if (!response) return;
      this.input = this.input.subarray(response.nextOffset);
      const pending = this.pending;
      this.pending = null;
      clearTimeout(pending.timeout);
      if (response.value instanceof RespServerError) pending.reject(new Error("Valkey rejected the command."));
      else pending.resolve(response.value);
    } catch {
      this.dispose(new Error("Valkey returned a malformed RESP response."));
    }
  }

  private dispose(reason: Error): void {
    if (this.closed) return;
    this.closed = true;
    const pending = this.pending;
    this.pending = null;
    if (pending) {
      clearTimeout(pending.timeout);
      pending.reject(reason);
    }
    const socket = this.socket;
    this.socket = null;
    if (socket && !socket.destroyed) socket.destroy();
  }
}
