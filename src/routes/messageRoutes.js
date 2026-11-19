import { Router } from 'express';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { renderInbox, renderChat, sendMessage } from '../controllers/messageController.js';

const router = Router();

router.get('/', requireAuth, renderInbox);
router.get('/:username', requireAuth, renderChat);
router.post('/:username', requireAuth, sendMessage);

export default router;