import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as adminController from '../controllers/admin.controller';

const router = Router();

router.use(authenticate);

router.get('/email/status', adminController.emailStatus);
router.post('/email/test', adminController.sendTestEmail);

export default router;
