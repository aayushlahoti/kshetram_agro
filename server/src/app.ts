import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { isDatabaseConnected } from './config/database.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { stubbleRouter } from './modules/stubble/stubble.routes.js';
import { mowersRouter } from './modules/mowers/mowers.routes.js';
import { dailySuggestionRouter } from './modules/daily-suggestion/daily-suggestion.routes.js';
import { seedsRouter } from './modules/seeds/seeds.routes.js';
import { cattleFeedRouter } from './modules/cattle-feed/cattle-feed.routes.js';

const app = express();
const port = Number(process.env.PORT ?? 4000);
const allowedOrigins = new Set([
  process.env.CLIENT_ORIGIN ?? 'http://localhost:3000',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json());

app.get('/health', async (_req, res) => {
  try {
    await isDatabaseConnected();
    res.json({ status: 'ok', service: 'kshetram-api', database: 'supabase-postgresql' });
  } catch {
    res.status(503).json({ status: 'degraded', service: 'kshetram-api', database: 'unavailable' });
  }
});

app.get('/api/health', async (_req, res) => {
  try {
    await isDatabaseConnected();
    res.json({ status: 'ok', service: 'kshetram-api', database: 'supabase-postgresql' });
  } catch {
    res.status(503).json({ status: 'degraded', service: 'kshetram-api', database: 'unavailable' });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/stubble', stubbleRouter);
app.use('/api/mowers', mowersRouter);
app.use('/api/tips', dailySuggestionRouter);
app.use('/api/seeds', seedsRouter);
app.use('/api/cattle-feed', cattleFeedRouter);

app.use((_req, res) => {
  res.status(404).json({ message: 'API route not found' });
});

// Temporary authentication and the stubble demo do not require Redis or PostgreSQL to start.
async function start() {
  app.listen(port, '0.0.0.0', () => console.log(`Kshetram API listening on http://localhost:${port}`));
}

start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

export default app;
