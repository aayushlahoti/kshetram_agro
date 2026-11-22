import { Router } from 'express';
import { z } from 'zod';

export const mowersRouter = Router();

const mowers = [
  { id: 'MW-101', name: 'Happy Seeder', district: 'Ludhiana', availableSlots: 3, subsidizedRate: 450 },
  { id: 'MW-204', name: 'Super Straw Management System', district: 'Patiala', availableSlots: 2, subsidizedRate: 600 },
  { id: 'MW-318', name: 'Rotary Mulcher', district: 'Karnal', availableSlots: 4, subsidizedRate: 500 },
];

const bookings = new Map<string, Set<string>>();

mowersRouter.get('/', (_req, res) => res.json(mowers));

mowersRouter.post('/:id/bookings', (req, res) => {
  const parsed = z.object({ date: z.string(), acreage: z.number().positive() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid booking details' });

  const mower = mowers.find((item) => item.id === req.params.id);
  if (!mower) return res.status(404).json({ message: 'Mower not found' });

  const slotKey = `${mower.id}:${parsed.data.date}`;
  const reserved = bookings.get(slotKey) ?? new Set<string>();
  if (reserved.size >= mower.availableSlots) return res.status(409).json({ message: 'Slot already full' });

  const bookingId = `booking-${Date.now()}`;
  reserved.add(bookingId);
  bookings.set(slotKey, reserved);
  return res.status(201).json({ id: bookingId, mowerId: mower.id, status: 'PENDING_CONFIRMATION', ...parsed.data });
});