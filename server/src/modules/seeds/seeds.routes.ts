import { Router } from 'express';

export const seedsRouter = Router();

seedsRouter.get('/catalog', (_req, res) => res.json([
  { id: 'SD-101', name: 'PBW 826 Wheat', crop: 'Wheat', germination: '92%', pricePerKg: 74, certified: true },
  { id: 'SD-204', name: 'Pusa 44 Rice', crop: 'Rice', germination: '88%', pricePerKg: 96, certified: true },
  { id: 'SD-318', name: 'Arkel Pea', crop: 'Vegetable', germination: '90%', pricePerKg: 210, certified: true },
]));