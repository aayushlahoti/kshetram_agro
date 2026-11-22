import { Router } from 'express';

export const dailySuggestionRouter = Router();

const tips = [
  { id: 'TIP-2026-11-21', title: 'Retain moisture while preparing for Rabi sowing', category: 'Residue care', season: 'Rabi', text: 'Lightly incorporate residue instead of burning it. Incorporate 15–20 days before sowing and ensure adequate nitrogen through approved inputs.' },
];

dailySuggestionRouter.get('/today', (_req, res) => res.json(tips[0]));
dailySuggestionRouter.get('/archive', (_req, res) => res.json(tips));