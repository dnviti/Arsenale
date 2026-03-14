import { Server as HttpServer, IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { URL } from 'url';
import {
  authenticateTunnel,
  registerTunnel,
  removeTunnel,
  handleIncomingFrame,
  startHeartbeatMonitor,
} from '../services/tunnel.service';
import * as auditService from '../services/audit.service';
import { logger } from '../utils/logger';

const log = logger.child('tunnel-handler');

const TUNNEL_PATH = '/api/tunnel/connect';

/**
 * Attaches a raw WebSocket server for tunnel agent connections.
 * Uses the `ws` library directly (not Socket.IO) for binary frame performance.
 */
export function setupTunnelHandler(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req: IncomingMessage, socket, head) => {
    // Only handle tunnel path
    const pathname = parsePathname(req);
    if (pathname !== TUNNEL_PATH) return; // Let other upgrade handlers (Socket.IO, guacamole) handle their own paths

    // Authenticate the tunnel agent
    authenticateTunnel(req.headers.authorization)
      .then((auth) => {
        if (!auth) {
          log.warn('Tunnel auth failed from ' + getClientIp(req));
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

        wss.handleUpgrade(req, socket, head, (ws) => {
          wss.emit('connection', ws, req, auth);
        });
      })
      .catch((err) => {
        log.error('Tunnel upgrade error:', err);
        socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
        socket.destroy();
      });
  });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage, auth: { gatewayId: string; tenantId: string }) => {
    const clientIp = getClientIp(req);
    const clientVersion = req.headers['x-tunnel-version'] as string | undefined;

    log.info(`Tunnel agent connected: gateway=${auth.gatewayId} ip=${clientIp}`);

    registerTunnel(auth.gatewayId, ws, clientVersion, clientIp);

    auditService.log({
      userId: null,
      action: 'TUNNEL_CONNECT',
      targetType: 'Gateway',
      targetId: auth.gatewayId,
      details: { clientIp, clientVersion },
      gatewayId: auth.gatewayId,
    });

    ws.binaryType = 'nodebuffer';

    ws.on('message', (data: Buffer) => {
      if (!Buffer.isBuffer(data)) return;
      handleIncomingFrame(auth.gatewayId, data);
    });

    ws.on('close', (code, reason) => {
      log.info(`Tunnel agent disconnected: gateway=${auth.gatewayId} code=${code} reason=${reason?.toString()}`);
      removeTunnel(auth.gatewayId);

      auditService.log({
        userId: null,
        action: 'TUNNEL_DISCONNECT',
        targetType: 'Gateway',
        targetId: auth.gatewayId,
        details: { code, reason: reason?.toString() },
        gatewayId: auth.gatewayId,
      });
    });

    ws.on('error', (err) => {
      log.error(`Tunnel WebSocket error for gateway ${auth.gatewayId}:`, err.message);
      removeTunnel(auth.gatewayId);
    });
  });

  // Start heartbeat monitoring
  startHeartbeatMonitor();

  log.info(`Tunnel WebSocket handler ready on ${TUNNEL_PATH}`);
  return wss;
}

function parsePathname(req: IncomingMessage): string {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    return url.pathname;
  } catch {
    return req.url ?? '/';
  }
}

function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress ?? 'unknown';
}
