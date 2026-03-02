import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../types';
import * as gatewayService from '../services/gateway.service';
import * as sshKeyService from '../services/sshkey.service';
import * as auditService from '../services/audit.service';
import { AppError } from '../middleware/error.middleware';

const createSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['GUACD', 'SSH_BASTION']),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  description: z.string().max(500).optional(),
  isDefault: z.boolean().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  sshPrivateKey: z.string().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  host: z.string().min(1).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  description: z.string().max(500).nullable().optional(),
  isDefault: z.boolean().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  sshPrivateKey: z.string().optional(),
});

export async function list(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await gatewayService.listGateways(req.user!.tenantId!);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function create(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const data = createSchema.parse(req.body);
    const result = await gatewayService.createGateway(
      req.user!.userId,
      req.user!.tenantId!,
      data,
    );
    auditService.log({
      userId: req.user!.userId,
      action: 'GATEWAY_CREATE',
      targetType: 'Gateway',
      targetId: result.id,
      details: { name: data.name, type: data.type, isDefault: data.isDefault ?? false },
      ipAddress: req.ip,
    });
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof z.ZodError) return next(new AppError(err.issues[0].message, 400));
    next(err);
  }
}

export async function update(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const data = updateSchema.parse(req.body);
    const gatewayId = req.params.id as string;
    const result = await gatewayService.updateGateway(
      req.user!.userId,
      req.user!.tenantId!,
      gatewayId,
      data,
    );
    auditService.log({
      userId: req.user!.userId,
      action: 'GATEWAY_UPDATE',
      targetType: 'Gateway',
      targetId: gatewayId,
      details: { fields: Object.keys(data) },
      ipAddress: req.ip,
    });
    res.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) return next(new AppError(err.issues[0].message, 400));
    next(err);
  }
}

export async function remove(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const gatewayId = req.params.id as string;
    const result = await gatewayService.deleteGateway(req.user!.tenantId!, gatewayId);
    auditService.log({
      userId: req.user!.userId,
      action: 'GATEWAY_DELETE',
      targetType: 'Gateway',
      targetId: gatewayId,
      ipAddress: req.ip,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function testConnectivity(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const gatewayId = req.params.id as string;
    const result = await gatewayService.testGatewayConnectivity(
      req.user!.tenantId!,
      gatewayId,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function generateSshKeyPair(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await sshKeyService.generateKeyPair(req.user!.tenantId!);
    auditService.log({
      userId: req.user!.userId,
      action: 'SSH_KEY_GENERATE',
      targetType: 'SshKeyPair',
      targetId: result.id,
      ipAddress: req.ip,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getSshPublicKey(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await sshKeyService.getPublicKey(req.user!.tenantId!);
    if (!result) {
      return next(new AppError('No SSH key pair found for this tenant', 404));
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function rotateSshKeyPair(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await sshKeyService.rotateKeyPair(req.user!.tenantId!);
    auditService.log({
      userId: req.user!.userId,
      action: 'SSH_KEY_ROTATE',
      targetType: 'SshKeyPair',
      targetId: result.id,
      ipAddress: req.ip,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function downloadSshPrivateKey(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const privateKeyBuf = await sshKeyService.getPrivateKey(req.user!.tenantId!);
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', 'attachment; filename="tenant_ed25519"');
    res.send(privateKeyBuf.toString('utf8'));
  } catch (err) {
    next(err);
  }
}
