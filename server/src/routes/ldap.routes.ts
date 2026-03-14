import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireTenantRole } from '../middleware/tenant.middleware';
import { asyncHandler } from '../middleware/asyncHandler';
import * as ldapController from '../controllers/ldap.controller';

const router = Router();

router.use(authenticate);

router.get('/status', requireTenantRole('ADMIN'), asyncHandler(ldapController.getStatus));
router.post('/test', requireTenantRole('ADMIN'), asyncHandler(ldapController.testConnection));
router.post('/sync', requireTenantRole('ADMIN'), asyncHandler(ldapController.triggerSync));

export default router;
