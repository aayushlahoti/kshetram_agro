import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize, isFarmer, isVerifiedGovtBuyer } from '../../middleware/auth.js';

export const stubbleRouter = Router();

interface DemoListing {
  id: string;
  farmerId: string;
  cropType: string;
  weightQuintals: number;
  moisturePercent: number;
  residueFormat: 'BALED' | 'UNBALED';
  latitude: number;
  longitude: number;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'SOLD';
  farmer: { id: string; name: string | null; phone?: string };
}

const demoListings: DemoListing[] = [];
const demoBids: Array<{ id: string; listingId: string; buyerId: string; amountPerQuintal: number; status: 'PENDING' | 'ACCEPTED' | 'REJECTED' }> = [];

const listingSchema = z.object({
  cropType: z.string().min(2),
  weightQuintals: z.number().positive(),
  moisturePercent: z.number().min(0).max(100),
  residueFormat: z.enum(['BALED', 'UNBALED']),
  latitude: z.number(),
  longitude: z.number(),
});

stubbleRouter.post('/listings', authenticate, isFarmer, (req, res) => {
  const parsed = listingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid listing details', issues: parsed.error.issues });

  const listing: DemoListing = {
    id: `listing-${Date.now()}`,
    farmerId: req.user!.id,
    ...parsed.data,
    status: 'PENDING_APPROVAL',
    farmer: { id: req.user!.id, name: null, phone: undefined },
  };
  demoListings.unshift(listing);
  return res.status(201).json(listing);
});

stubbleRouter.get('/listings', authenticate, authorize('FARMER', 'GOVT_BUYER', 'ADMIN'), (req, res) => {
  const role = req.user!.role;
  if (role === 'GOVT_BUYER' && req.user!.kycStatus !== 'APPROVED') {
    return res.status(403).json({ message: 'Verified Government Buyer badge required' });
  }

  let listings = role === 'FARMER'
    ? demoListings.filter((listing) => listing.farmerId === req.user!.id)
    : role === 'GOVT_BUYER'
      ? demoListings.filter((listing) => listing.status === 'APPROVED')
      : demoListings;

  if (role === 'FARMER') {
    listings = listings.map((listing) => ({ ...listing, latitude: 0, longitude: 0, farmer: { id: listing.farmer.id, name: listing.farmer.name } }));
  }
  return res.json(listings.map((listing) => ({
    ...listing,
    bids: demoBids.filter((bid) => bid.listingId === listing.id),
  })));
});

stubbleRouter.patch('/listings/:id/moderate', authenticate, authorize('ADMIN'), (req, res) => {
  const listingId = String(req.params.id);
  const parsed = z.object({ status: z.enum(['APPROVED', 'REJECTED']), reason: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid moderation status' });

  const listing = demoListings.find((item) => item.id === listingId);
  if (!listing) return res.status(404).json({ message: 'Listing not found' });
  listing.status = parsed.data.status;
  return res.json(listing);
});

stubbleRouter.post('/listings/:id/bids', authenticate, isVerifiedGovtBuyer, (req, res) => {
  const listingId = String(req.params.id);
  const parsed = z.object({ amountPerQuintal: z.number().positive() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Valid bid amount required' });

  const listing = demoListings.find((item) => item.id === listingId && item.status === 'APPROVED');
  if (!listing) return res.status(404).json({ message: 'Approved listing not found' });

  const existing = demoBids.find((bid) => bid.listingId === listingId && bid.buyerId === req.user!.id);
  if (existing) {
    existing.amountPerQuintal = parsed.data.amountPerQuintal;
    existing.status = 'PENDING';
    return res.json(existing);
  }

  const bid = { id: `bid-${Date.now()}`, listingId, buyerId: req.user!.id, amountPerQuintal: parsed.data.amountPerQuintal, status: 'PENDING' as const };
  demoBids.push(bid);
  return res.status(201).json(bid);
});

stubbleRouter.patch('/bids/:id/accept', authenticate, isFarmer, (req, res) => {
  const bidId = String(req.params.id);
  const bid = demoBids.find((item) => item.id === bidId);
  if (!bid) return res.status(404).json({ message: 'Bid not found' });

  const listing = demoListings.find((item) => item.id === bid.listingId);
  if (!listing || listing.farmerId !== req.user!.id) {
    return res.status(404).json({ message: 'Bid not found' });
  }

  bid.status = 'ACCEPTED';
  listing.status = 'SOLD';
  demoBids.filter((item) => item.listingId === bid.listingId && item.id !== bidId)
    .forEach((item) => item.status = 'REJECTED');

  return res.json({ id: `order-${Date.now()}`, listingId: listing.id, bidId: bid.id, status: 'CONFIRMED' });
});

stubbleRouter.get('/orders', authenticate, (_req, res) => {
  return res.json([]);
});

stubbleRouter.patch('/orders/:id/status', authenticate, (req, res) => {
  const parsed = z.object({
    status: z.enum(['PICKUP_SCHEDULED', 'WEIGHBRIDGE_VERIFIED', 'PAYMENT_PENDING', 'SETTLED', 'CANCELLED']),
    verifiedWeightQuintals: z.number().positive().optional(),
    settlementAmount: z.number().positive().optional(),
    bankReference: z.string().optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid order status update' });
  return res.json({ id: String(req.params.id), ...parsed.data });
});
