import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';
import prisma from '../lib/prisma';
import { config } from '../config';
import { logger } from '../utils/logger';
import type { SessionProtocol, RecordingStatus } from '../lib/prisma';

// ── Asciicast v2 writer (SSH recordings) ────────────────────────────

export class AsciicastWriter {
  private fd: number | null = null;
  private startTime: number = 0;
  private filePath: string;
  private bytesWritten = 0;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async open(cols: number, rows: number): Promise<void> {
    await fsp.mkdir(path.dirname(this.filePath), { recursive: true });
    this.fd = fs.openSync(this.filePath, 'w');
    this.startTime = Date.now();
    const header = JSON.stringify({
      version: 2,
      width: cols,
      height: rows,
      timestamp: Math.floor(this.startTime / 1000),
      env: { TERM: 'xterm-256color' },
    });
    fs.writeSync(this.fd, header + '\n');
    this.bytesWritten += Buffer.byteLength(header) + 1;
  }

  writeOutput(data: string): void {
    if (!this.fd) return;
    const elapsed = (Date.now() - this.startTime) / 1000;
    const line = JSON.stringify([elapsed, 'o', data]);
    fs.writeSync(this.fd, line + '\n');
    this.bytesWritten += Buffer.byteLength(line) + 1;
  }

  writeInput(data: string): void {
    if (!this.fd) return;
    const elapsed = (Date.now() - this.startTime) / 1000;
    const line = JSON.stringify([elapsed, 'i', data]);
    fs.writeSync(this.fd, line + '\n');
    this.bytesWritten += Buffer.byteLength(line) + 1;
  }

  close(): { fileSize: number; duration: number } {
    const duration = Math.round((Date.now() - this.startTime) / 1000);
    if (this.fd !== null) {
      fs.closeSync(this.fd);
      this.fd = null;
    }
    return { fileSize: this.bytesWritten, duration };
  }
}

// ── CRUD operations ─────────────────────────────────────────────────

export async function startRecording(params: {
  userId: string;
  connectionId: string;
  sessionId?: string;
  protocol: SessionProtocol;
  format: string;
  filePath: string;
}): Promise<string> {
  const recording = await prisma.sessionRecording.create({
    data: {
      userId: params.userId,
      connectionId: params.connectionId,
      sessionId: params.sessionId,
      protocol: params.protocol,
      format: params.format,
      filePath: params.filePath,
      status: 'RECORDING',
    },
  });
  return recording.id;
}

export async function completeRecording(
  recordingId: string,
  fileSize: number,
  duration: number,
): Promise<void> {
  await prisma.sessionRecording.update({
    where: { id: recordingId },
    data: {
      status: 'COMPLETE',
      fileSize,
      duration,
      completedAt: new Date(),
    },
  });
  logger.info(`[recording] Completed recording ${recordingId} (${fileSize} bytes, ${duration}s)`);
}

export async function failRecording(recordingId: string): Promise<void> {
  await prisma.sessionRecording.update({
    where: { id: recordingId },
    data: { status: 'ERROR', completedAt: new Date() },
  });
  logger.info(`[recording] Recording ${recordingId} failed`);
}

/**
 * Finalize a guacd-written recording (RDP/VNC) when the guacamole connection closes.
 * guacd writes the .guac file to disk; we read its size and compute duration from DB timestamps.
 */
export async function completeGuacRecording(recordingId: string): Promise<void> {
  const recording = await prisma.sessionRecording.findUnique({
    where: { id: recordingId },
  });
  if (!recording || recording.status !== 'RECORDING') return;

  try {
    const stat = await fsp.stat(recording.filePath);
    const duration = Math.round((Date.now() - recording.createdAt.getTime()) / 1000);
    await completeRecording(recordingId, stat.size, duration);
  } catch {
    // File doesn't exist — guacd may not have written it (connection too short, error, etc.)
    logger.warn(`[recording] Recording file not found for ${recordingId}: ${recording.filePath}`);
    await failRecording(recordingId);
  }
}

export async function getRecording(recordingId: string, userId: string) {
  return prisma.sessionRecording.findFirst({
    where: { id: recordingId, userId },
    include: {
      connection: { select: { id: true, name: true, type: true, host: true, port: true } },
    },
  });
}

export async function listRecordings(params: {
  userId: string;
  tenantId?: string;
  connectionId?: string;
  protocol?: SessionProtocol;
  status?: RecordingStatus;
  limit?: number;
  offset?: number;
}) {
  const where: Record<string, unknown> = {};

  // If tenantId is set, show recordings for all tenant members (admin view)
  if (params.tenantId) {
    where.user = {
      tenantMemberships: { some: { tenantId: params.tenantId, isActive: true } },
    };
  } else {
    where.userId = params.userId;
  }

  if (params.connectionId) where.connectionId = params.connectionId;
  if (params.protocol) where.protocol = params.protocol;
  if (params.status) where.status = params.status;

  const [recordings, total] = await Promise.all([
    prisma.sessionRecording.findMany({
      where,
      include: {
        connection: { select: { id: true, name: true, type: true, host: true } },
        user: { select: { id: true, email: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: params.limit ?? 50,
      skip: params.offset ?? 0,
    }),
    prisma.sessionRecording.count({ where }),
  ]);

  return { recordings, total };
}

export async function deleteRecording(recordingId: string, userId: string): Promise<boolean> {
  const recording = await prisma.sessionRecording.findFirst({
    where: { id: recordingId, userId },
  });
  if (!recording) return false;

  // Delete file from disk
  try {
    await fsp.unlink(recording.filePath);
  } catch {
    logger.warn(`Recording file not found on disk: ${recording.filePath}`);
  }

  await prisma.sessionRecording.delete({ where: { id: recordingId } });
  return true;
}

export function streamRecordingFile(filePath: string): Readable | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return fs.createReadStream(filePath);
  } catch {
    return null;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

export function buildRecordingPath(
  userId: string,
  connectionId: string,
  protocol: string,
  ext: string,
  gatewayDir?: string,
): string {
  const timestamp = Date.now();
  const subdir = gatewayDir || 'default';
  const dir = path.join(config.recordingPath, subdir, userId);
  return path.join(dir, `${connectionId}-${protocol.toLowerCase()}-${timestamp}.${ext}`);
}

export async function cleanupExpiredRecordings(): Promise<number> {
  if (config.recordingRetentionDays <= 0) return 0;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - config.recordingRetentionDays);

  const expired = await prisma.sessionRecording.findMany({
    where: { createdAt: { lt: cutoff }, status: 'COMPLETE' },
    select: { id: true, filePath: true },
  });

  for (const rec of expired) {
    try { await fsp.unlink(rec.filePath); } catch { /* file may already be gone */ }
  }

  if (expired.length > 0) {
    await prisma.sessionRecording.deleteMany({
      where: { id: { in: expired.map((r) => r.id) } },
    });
    logger.info(`[recording] Cleaned up ${expired.length} expired recordings`);
  }

  return expired.length;
}
