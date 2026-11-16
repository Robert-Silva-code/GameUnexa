import { Router } from 'express';
import { requireAuth } from '../middlewares/authMiddleware.js';
import {
  renderCatalog,
  saveToLibrary,
  toggleFavorite,
  addReview
} from '../controllers/gameController.js';

const router = Router();

router.get('/catalog', requireAuth, renderCatalog);
router.post('/library', requireAuth, saveToLibrary);
router.post('/favorite', requireAuth, toggleFavorite);
router.post('/review', requireAuth, addReview);

export default router;