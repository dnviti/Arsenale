import crypto from 'crypto';
import net from 'net';
import { Duplex } from 'stream';
import { WebSocket } from 'ws';
import prisma from '../lib/prisma';
import { AppError } from '../middleware/error.middleware';
import { encryptWithServerKey, decryptWithServerKey } from './crypto.service';
import { hashToken } from './crypto.service';
import * as auditService from './audit.service';
import { logger } from '../utils/logger';
import { findFreePort } from '../utils/freePort';

const log = logger.child('tunnel');

// --- Binary multiplexing protocol ---
// 4-byte header: [type(u8), flags(u8), streamID(u16 BE)]
const FRAME_HEADER_SIZE = 4;

// Frame types
const FRAME_OPEN = 0x01;
const FRAME_DATA = 0x02;
const FRAME_CLOSE = 0x03;
const FRAME_PING = 0x04;
const FRAME_PONG = 0x05;

// --- Tunnel connection registry ---

interface TunnelStream {
  duplex: TunnelDuplex;
}

/**
 * A Duplex stream backed by a multiplexed tunnel channel.
 * Reads are pushed from incoming DATA frames; writes are forwarded to the WebSocket.
 */
class TunnelDuplex extends Duplex {
  private _sendFrame: (chunk: Buffer) => void;

  constructor(sendFrame: (chunk: Buffer) => void) {
    super();
    this._sendFrame = sendFrame;
  }

  _read(): void {
    // Data is pushed externally via push()
  }

  _write(chunk: Buffer, _encoding: string, callback: (error?: Error | null) => void): void {
    try {
      this._sendFrame(chunk);
      callback();
    } catch (err) {
      callback(err instanceof Error ? err : new Error(String(err)));
    }
  }
}

interface TunnelConnection {
  ws: WebSocket;
  gatewayId: string;
  streams: Map<number, TunnelStream>;
  nextStreamId: number;
  connectedAt: Date;
  lastHeartbeat: Date;
  clientVersion?: string;
  clientIp?: string;
}

const tunnelRegistry = new Map<string, TunnelConnection>();

// --- Heartbeat interval ---
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 90_000;

export function startHeartbeatMonitor(): void {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    const now = Date.now();
    for (const [gatewayId, conn] of tunnelRegistry.entries()) {
      if (now - conn.lastHeartbeat.getTime() > HEARTBEAT_TIMEOUT_MS) {
        log.warn(`Tunnel heartbeat timeout for gateway ${gatewayId}, disconnecting`);
        conn.ws.close(4001, 'Heartbeat timeout');
        removeTunnel(gatewayId);
      } else {
        // Send PING
        const pingFrame = Buffer.alloc(FRAME_HEADER_SIZE);
        pingFrame.writeUInt8(FRAME_PING, 0);
        pingFrame.writeUInt8(0, 1);
        pingFrame.writeUInt16BE(0, 2);
        if (conn.ws.readyState === WebSocket.OPEN) {
          conn.ws.send(pingFrame);
        }
      }
    }
  }, HEARTBEAT_INTERVAL_MS);
}

export function stopHeartbeatMonitor(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

// --- Token & certificate management ---

export async function generateTunnelToken(gatewayId: string, tenantId: string, userId: string): Promise<{
  token: string;
  caCert: string;
  clientCert: string;
  clientCertExpiry: Date;
}> {
  // Verify gateway belongs to tenant
  const gateway = await prisma.gateway.findFirst({
    where: { id: gatewayId, tenantId },
    select: { id: true, name: true },
  });
  if (!gateway) throw new AppError('Gateway not found', 404);

  // Generate 256-bit tunnel token
  const tokenBytes = crypto.randomBytes(32);
  const token = tokenBytes.toString('base64url');
  const tokenHash = hashToken(token);

  // Encrypt token for storage
  const encryptedToken = encryptWithServerKey(token);

  // Generate per-gateway Ed25519 CA keypair
  const { publicKey: caPub, privateKey: caPriv } = crypto.generateKeyPairSync('ed25519');
  const caCertPem = caPub.export({ type: 'spki', format: 'pem' }) as string;
  const caKeyPem = caPriv.export({ type: 'pkcs8', format: 'pem' }) as string;

  // Encrypt CA private key at rest
  const encryptedCaKey = encryptWithServerKey(caKeyPem);

  // Generate client certificate (self-signed with CA key, 90-day validity)
  // Since Node.js doesn't have built-in X.509 cert generation, we store
  // the CA public key as the "client cert" and use the token for auth.
  // The mTLS layer uses the Ed25519 keypair for identity verification.
  const clientCertExpiry = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  const clientCertData = {
    gatewayId,
    caPubKey: caCertPem,
    issuedAt: new Date().toISOString(),
    expiresAt: clientCertExpiry.toISOString(),
    fingerprint: crypto.createHash('sha256').update(caCertPem).digest('hex'),
  };
  const clientCert = Buffer.from(JSON.stringify(clientCertData)).toString('base64');

  await prisma.gateway.update({
    where: { id: gatewayId },
    data: {
      tunnelEnabled: true,
      encryptedTunnelToken: encryptedToken.ciphertext,
      tunnelTokenIV: encryptedToken.iv,
      tunnelTokenTag: encryptedToken.tag,
      tunnelTokenHash: tokenHash,
      tunnelCaCert: caCertPem,
      encryptedCaKey: encryptedCaKey.ciphertext,
      caKeyIV: encryptedCaKey.iv,
      caKeyTag: encryptedCaKey.tag,
      tunnelClientCert: clientCert,
      tunnelClientCertExp: clientCertExpiry,
    },
  });

  auditService.log({
    userId,
    action: 'TUNNEL_TOKEN_GENERATE',
    targetType: 'Gateway',
    targetId: gatewayId,
    details: { gatewayName: gateway.name, certExpiry: clientCertExpiry.toISOString() },
  });

  return { token, caCert: caCertPem, clientCert, clientCertExpiry };
}

export async function revokeTunnelToken(gatewayId: string, tenantId: string, userId: string): Promise<void> {
  const gateway = await prisma.gateway.findFirst({
    where: { id: gatewayId, tenantId },
    select: { id: true, name: true },
  });
  if (!gateway) throw new AppError('Gateway not found', 404);

  // Disconnect active tunnel if any
  const conn = tunnelRegistry.get(gatewayId);
  if (conn) {
    conn.ws.close(4002, 'Token revoked');
    removeTunnel(gatewayId);
  }

  await prisma.gateway.update({
    where: { id: gatewayId },
    data: {
      tunnelEnabled: false,
      encryptedTunnelToken: null,
      tunnelTokenIV: null,
      tunnelTokenTag: null,
      tunnelTokenHash: null,
      tunnelConnectedAt: null,
      tunnelLastHeartbeat: null,
      tunnelClientVersion: null,
      tunnelClientIp: null,
      tunnelCaCert: null,
      encryptedCaKey: null,
      caKeyIV: null,
      caKeyTag: null,
      tunnelClientCert: null,
      tunnelClientCertExp: null,
    },
  });

  auditService.log({
    userId,
    action: 'TUNNEL_TOKEN_REVOKE',
    targetType: 'Gateway',
    targetId: gatewayId,
    details: { gatewayName: gateway.name },
  });
}

// --- Tunnel authentication ---

export async function authenticateTunnel(authHeader: string | undefined): Promise<{
  gatewayId: string;
  tenantId: string;
} | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const tokenHash = hashToken(token);

  const gateway = await prisma.gateway.findFirst({
    where: { tunnelTokenHash: tokenHash, tunnelEnabled: true },
    select: { id: true, tenantId: true, encryptedTunnelToken: true, tunnelTokenIV: true, tunnelTokenTag: true },
  });
  if (!gateway) return null;
  if (!gateway.encryptedTunnelToken || !gateway.tunnelTokenIV || !gateway.tunnelTokenTag) return null;

  // Verify with constant-time comparison via decryption + hash check
  try {
    const storedToken = decryptWithServerKey({
      ciphertext: gateway.encryptedTunnelToken,
      iv: gateway.tunnelTokenIV,
      tag: gateway.tunnelTokenTag,
    });
    const storedHash = hashToken(storedToken);
    if (!crypto.timingSafeEqual(Buffer.from(tokenHash, 'hex'), Buffer.from(storedHash, 'hex'))) {
      return null;
    }
  } catch {
    return null;
  }

  return { gatewayId: gateway.id, tenantId: gateway.tenantId };
}

// --- Tunnel connection management ---

export function registerTunnel(
  gatewayId: string,
  ws: WebSocket,
  clientVersion?: string,
  clientIp?: string,
): void {
  // Close existing tunnel for this gateway if any
  const existing = tunnelRegistry.get(gatewayId);
  if (existing) {
    log.warn(`Replacing existing tunnel for gateway ${gatewayId}`);
    existing.ws.close(4003, 'Replaced by new connection');
    cleanupStreams(existing);
  }

  const conn: TunnelConnection = {
    ws,
    gatewayId,
    streams: new Map(),
    nextStreamId: 1,
    connectedAt: new Date(),
    lastHeartbeat: new Date(),
    clientVersion,
    clientIp,
  };

  tunnelRegistry.set(gatewayId, conn);

  // Update gateway record
  prisma.gateway.update({
    where: { id: gatewayId },
    data: {
      tunnelConnectedAt: conn.connectedAt,
      tunnelLastHeartbeat: conn.lastHeartbeat,
      tunnelClientVersion: clientVersion ?? null,
      tunnelClientIp: clientIp ?? null,
    },
  }).catch((err) => {
    log.error(`Failed to update gateway tunnel status: ${err}`);
  });

  log.info(`Tunnel registered for gateway ${gatewayId} from ${clientIp ?? 'unknown'}`);
}

export function removeTunnel(gatewayId: string): void {
  const conn = tunnelRegistry.get(gatewayId);
  if (!conn) return;
  cleanupStreams(conn);
  tunnelRegistry.delete(gatewayId);

  // Clear connection state in DB
  prisma.gateway.update({
    where: { id: gatewayId },
    data: {
      tunnelConnectedAt: null,
      tunnelLastHeartbeat: null,
      tunnelClientVersion: null,
      tunnelClientIp: null,
    },
  }).catch((err) => {
    log.error(`Failed to clear gateway tunnel status: ${err}`);
  });

  log.info(`Tunnel removed for gateway ${gatewayId}`);
}

function cleanupStreams(conn: TunnelConnection): void {
  for (const [, stream] of conn.streams) {
    stream.duplex.destroy();
  }
  conn.streams.clear();
}

export function isTunnelConnected(gatewayId: string): boolean {
  const conn = tunnelRegistry.get(gatewayId);
  return conn !== undefined && conn.ws.readyState === WebSocket.OPEN;
}

export function getTunnelStatus(gatewayId: string): {
  connected: boolean;
  connectedAt?: Date;
  lastHeartbeat?: Date;
  clientVersion?: string;
  clientIp?: string;
  activeStreams: number;
} {
  const conn = tunnelRegistry.get(gatewayId);
  if (!conn || conn.ws.readyState !== WebSocket.OPEN) {
    return { connected: false, activeStreams: 0 };
  }
  return {
    connected: true,
    connectedAt: conn.connectedAt,
    lastHeartbeat: conn.lastHeartbeat,
    clientVersion: conn.clientVersion,
    clientIp: conn.clientIp,
    activeStreams: conn.streams.size,
  };
}

// --- Stream multiplexing ---

/**
 * Opens a new multiplexed stream through the tunnel to the target host:port.
 * Returns a net.Duplex-compatible stream for transparent integration with SSH2 / guacamole-lite.
 */
export function openStream(gatewayId: string, targetHost: string, targetPort: number): Duplex {
  const conn = tunnelRegistry.get(gatewayId);
  if (!conn || conn.ws.readyState !== WebSocket.OPEN) {
    throw new AppError('Tunnel not connected for this gateway', 502);
  }

  const streamId = conn.nextStreamId++;
  if (conn.nextStreamId > 0xffff) {
    conn.nextStreamId = 1; // wrap around (stream IDs are u16)
  }

  const wsRef = conn.ws;

  const duplex = new TunnelDuplex((chunk: Buffer) => {
    const dataFrame = Buffer.alloc(FRAME_HEADER_SIZE + chunk.length);
    dataFrame.writeUInt8(FRAME_DATA, 0);
    dataFrame.writeUInt8(0, 1);
    dataFrame.writeUInt16BE(streamId, 2);
    chunk.copy(dataFrame, FRAME_HEADER_SIZE);
    if (wsRef.readyState === WebSocket.OPEN) {
      wsRef.send(dataFrame);
    }
  });

  conn.streams.set(streamId, { duplex });

  // Send OPEN frame with target info
  const targetInfo = Buffer.from(JSON.stringify({ host: targetHost, port: targetPort }));
  const openFrame = Buffer.alloc(FRAME_HEADER_SIZE + targetInfo.length);
  openFrame.writeUInt8(FRAME_OPEN, 0);
  openFrame.writeUInt8(0, 1);
  openFrame.writeUInt16BE(streamId, 2);
  targetInfo.copy(openFrame, FRAME_HEADER_SIZE);
  conn.ws.send(openFrame);

  // Clean up on stream close
  duplex.on('close', () => {
    conn.streams.delete(streamId);
    const closeFrame = Buffer.alloc(FRAME_HEADER_SIZE);
    closeFrame.writeUInt8(FRAME_CLOSE, 0);
    closeFrame.writeUInt8(0, 1);
    closeFrame.writeUInt16BE(streamId, 2);
    if (wsRef.readyState === WebSocket.OPEN) {
      wsRef.send(closeFrame);
    }
  });

  return duplex;
}

/**
 * Handles an incoming binary frame from the tunnel agent.
 */
export function handleIncomingFrame(gatewayId: string, data: Buffer): void {
  if (data.length < FRAME_HEADER_SIZE) return;

  const type = data.readUInt8(0);
  const streamId = data.readUInt16BE(2);
  const conn = tunnelRegistry.get(gatewayId);
  if (!conn) return;

  switch (type) {
    case FRAME_DATA: {
      const stream = conn.streams.get(streamId);
      if (stream) {
        stream.duplex.push(data.subarray(FRAME_HEADER_SIZE));
      }
      break;
    }
    case FRAME_CLOSE: {
      const stream = conn.streams.get(streamId);
      if (stream) {
        stream.duplex.push(null); // signal EOF
        stream.duplex.destroy();
        conn.streams.delete(streamId);
      }
      break;
    }
    case FRAME_PONG: {
      conn.lastHeartbeat = new Date();
      // Update heartbeat in DB (fire-and-forget)
      prisma.gateway.update({
        where: { id: gatewayId },
        data: { tunnelLastHeartbeat: conn.lastHeartbeat },
      }).catch(() => { /* ignore */ });
      break;
    }
    case FRAME_PING: {
      // Agent sent us a ping, respond with pong
      const pongFrame = Buffer.alloc(FRAME_HEADER_SIZE);
      pongFrame.writeUInt8(FRAME_PONG, 0);
      pongFrame.writeUInt8(0, 1);
      pongFrame.writeUInt16BE(0, 2);
      if (conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(pongFrame);
      }
      conn.lastHeartbeat = new Date();
      break;
    }
  }
}

// --- Local TCP proxy for GUACD tunnels ---

/**
 * Creates a local TCP server that proxies connections through the tunnel.
 * Returns the local host:port that guacamole-lite can connect to.
 */
export async function createTunnelProxy(
  gatewayId: string,
  targetHost: string,
  targetPort: number,
): Promise<{ host: string; port: number; close: () => void }> {
  const localPort = await findFreePort();
  const localHost = '127.0.0.1';

  const server = net.createServer((socket) => {
    try {
      const tunnelStream = openStream(gatewayId, targetHost, targetPort);
      socket.pipe(tunnelStream);
      tunnelStream.pipe(socket);

      socket.on('error', () => tunnelStream.destroy());
      tunnelStream.on('error', () => socket.destroy());
      socket.on('close', () => tunnelStream.destroy());
      tunnelStream.on('close', () => socket.destroy());
    } catch (err) {
      log.error(`Tunnel proxy connection failed: ${err}`);
      socket.destroy();
    }
  });

  return new Promise((resolve, reject) => {
    server.listen(localPort, localHost, () => {
      log.info(`Tunnel proxy for gateway ${gatewayId} listening on ${localHost}:${localPort} → ${targetHost}:${targetPort}`);
      resolve({
        host: localHost,
        port: localPort,
        close: () => server.close(),
      });
    });
    server.on('error', reject);
  });
}

/** Get count of active tunnels (for monitoring/health). */
export function getActiveTunnelCount(): number {
  return tunnelRegistry.size;
}

/** Disconnect all tunnels (for shutdown). */
export function disconnectAllTunnels(): void {
  for (const [gatewayId, conn] of tunnelRegistry.entries()) {
    conn.ws.close(1001, 'Server shutting down');
    cleanupStreams(conn);
    tunnelRegistry.delete(gatewayId);
  }
  stopHeartbeatMonitor();
}
