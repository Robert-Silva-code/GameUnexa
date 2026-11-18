import { Router } from 'express';
import { requireAuth } from '../middlewares/authMiddleware.js';
import {
  renderCatalog,
  renderGameDetails,
  saveToLibrary,
  toggleFavorite,
  addReview,
  searchGamesJson
} from '../controllers/gameController.js';

const router = Router();

router.get('/catalog', requireAuth, renderCatalog);
router.get('/api/search', requireAuth, searchGamesJson)
router.get('/:igdbId', requireAuth, renderGameDetails);
router.post('/library', requireAuth, saveToLibrary);
router.post('/favorite', requireAuth, toggleFavorite);
router.post('/review', requireAuth, addReview);

export default router;