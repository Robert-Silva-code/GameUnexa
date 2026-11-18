import { Router } from 'express';
import { requireAuth } from '../middlewares/authMiddleware.js';
import {
  renderProfile,
  removeFromLibrary,
  renderCommunity,
  toggleFollow,
  renderFeed,
  createPost
} from '../controllers/socialController.js';

const router = Router();

router.get('/feed', requireAuth, renderFeed);
router.post('/feed/post', requireAuth, createPost);

router.get('/profile', requireAuth, renderProfile);
router.get('/profile/:username', requireAuth, renderProfile);
router.post('/profile/library/remove', requireAuth, removeFromLibrary);

router.get('/community', requireAuth, renderCommunity);
router.post('/community/follow/:targetId', requireAuth, toggleFollow);

export default router;