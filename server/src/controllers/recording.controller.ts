import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../types';
import * as recordingService from '../services/recording.service';
import * as auditService from '../services/audit.service';
import { AppError } from '../middleware/error.middleware';

const listQuerySchema = z.object({
  connectionId: z.string().uuid().optional(),
  protocol: z.enum(['SSH', 'RDP', 'VNC']).optional(),
  status: z.enum(['RECORDING', 'COMPLETE', 'ERROR']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export async function listRecordings(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const query = listQuerySchema.parse(req.query);
    const result = await recordingService.listRecordings({
      userId: req.user!.userId,
      tenantId: req.user!.tenantId,
      ...query,
    });
    res.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) return next(new AppError(err.issues[0].message, 400));
    next(err);
  }
}

export async function getRecording(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const recording = await recordingService.getRecording(req.params.id as string, req.user!.userId);
    if (!recording) throw new AppError('Recording not found', 404);

    auditService.log({
      userId: req.user!.userId,
      action: 'RECORDING_VIEW',
      targetType: 'Recording',
      targetId: recording.id,
      details: { protocol: recording.protocol, connectionId: recording.connectionId },
      ipAddress: req.ip,
    });

    res.json(recording);
  } catch (err) {
    next(err);
  }
}

export async function streamRecording(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const recording = await recordingService.getRecording(req.params.id as string, req.user!.userId);
    if (!recording) throw new AppError('Recording not found', 404);

    const stream = recordingService.streamRecordingFile(recording.filePath);
    if (!stream) throw new AppError('Recording file not found on disk', 404);

    const contentType = recording.format === 'asciicast' ? 'application/x-asciicast' : 'application/octet-stream';
    const ext = recording.format === 'asciicast' ? 'cast' : recording.format;
    const filename = `recording-${recording.id}.${ext}`;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    if (recording.fileSize) res.setHeader('Content-Length', recording.fileSize);

    stream.pipe(res);
  } catch (err) {
    next(err);
  }
}

export async function deleteRecording(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const deleted = await recordingService.deleteRecording(req.params.id as string, req.user!.userId);
    if (!deleted) throw new AppError('Recording not found', 404);

    auditService.log({
      userId: req.user!.userId,
      action: 'RECORDING_DELETE',
      targetType: 'Recording',
      targetId: req.params.id as string,
      ipAddress: req.ip,
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
