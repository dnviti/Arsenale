import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireTenant, requireTenantRole } from '../middleware/tenant.middleware';
import { validate, validateUuidParam } from '../middleware/validate.middleware';
import { createKeystrokePolicySchema, updateKeystrokePolicySchema } from '../schemas/keystrokePolicy.schemas';
import * as controller from '../controllers/keystrokePolicy.controller';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();

router.use(authenticate);
router.use(requireTenant);
router.use(requireTenantRole('ADMIN'));

router.get('/', asyncHandler(controller.listPolicies));
router.get('/:policyId', validateUuidParam('policyId'), asyncHandler(controller.getPolicy));
router.post('/', validate(createKeystrokePolicySchema), asyncHandler(controller.createPolicy));
router.put('/:policyId', validateUuidParam('policyId'), validate(updateKeystrokePolicySchema), asyncHandler(controller.updatePolicy));
router.delete('/:policyId', validateUuidParam('policyId'), asyncHandler(controller.deletePolicy));

export default router;
