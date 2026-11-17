import { Router } from 'express';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { renderEditProfile, updateProfile } from '../controllers/userController.js';

const router = Router();

router.get('/edit', requireAuth, renderEditProfile);
router.post('/edit', requireAuth, updateProfile);

export default router;