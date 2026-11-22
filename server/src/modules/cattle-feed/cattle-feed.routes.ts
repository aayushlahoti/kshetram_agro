import { Router } from 'express';

export const cattleFeedRouter = Router();

cattleFeedRouter.get('/catalog', (_req, res) => res.json([
  { id: 'CF-101', name: 'Balanced Dairy Pellets', category: 'Compound feed', price: 1650 },
  { id: 'CF-204', name: 'Dry Wheat Straw Bales', category: 'Dry fodder', price: 480 },
  { id: 'CF-318', name: 'Maize Silage', category: 'Silage', price: 620 },
  { id: 'CF-420', name: 'Mineral Mixture', category: 'Supplement', price: 390 },
]));