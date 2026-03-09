import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as recordingController from '../controllers/recording.controller';

const router = Router();
router.use(authenticate);

router.get('/', recordingController.listRecordings);
router.get('/:id', recordingController.getRecording);
router.get('/:id/stream', recordingController.streamRecording);
router.get('/:id/analyze', recordingController.analyzeRecording);
router.delete('/:id', recordingController.deleteRecording);

export default router;
