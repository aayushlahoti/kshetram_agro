import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../config/database.js';
import { authenticate, authorize, isFarmer, isVerifiedGovtBuyer } from '../../middleware/auth.js';

export const stubbleRouter = Router();

const listingSchema = z.object({
  cropType: z.string().min(2),
  weightQuintals: z.number().positive(),
  moisturePercent: z.number().min(0).max(100),
  residueFormat: z.enum(['BALED', 'UNBALED']),
  latitude: z.number(),
  longitude: z.number(),
});

async function getListings(role: string, userId: string) {
  let result;
  if (role === 'FARMER') {
    result = await pool.query(`select l.*, u.name as farmer_name, u.phone as farmer_phone,
      coalesce(json_agg(json_build_object('id', b.id, 'listingId', b.listing_id, 'buyerId', b.buyer_id, 'amountPerQuintal', b.amount_per_quintal, 'status', b.status)) filter (where b.id is not null), '[]') as bids
      from stubble_listings l join users u on u.id=l.farmer_id left join stubble_bids b on b.listing_id=l.id
      where l.farmer_id=$1 group by l.id,u.name,u.phone order by l.created_at desc`, [userId]);
  } else if (role === 'GOVT_BUYER') {
    result = await pool.query(`select l.*, u.name as farmer_name,
      coalesce(json_agg(json_build_object('id', b.id, 'listingId', b.listing_id, 'buyerId', b.buyer_id, 'amountPerQuintal', b.amount_per_quintal, 'status', b.status)) filter (where b.id is not null), '[]') as bids
      from stubble_listings l join users u on u.id=l.farmer_id left join stubble_bids b on b.listing_id=l.id
      where l.status='APPROVED' group by l.id,u.name order by l.created_at desc`);
  } else {
    result = await pool.query(`select l.*, u.name as farmer_name, u.phone as farmer_phone,
      coalesce(json_agg(json_build_object('id', b.id, 'listingId', b.listing_id, 'buyerId', b.buyer_id, 'amountPerQuintal', b.amount_per_quintal, 'status', b.status)) filter (where b.id is not null), '[]') as bids
      from stubble_listings l join users u on u.id=l.farmer_id left join stubble_bids b on b.listing_id=l.id
      group by l.id,u.name,u.phone order by l.created_at desc`);
  }

  return result.rows.map((row: any) => ({
    id: row.id,
    farmerId: row.farmer_id,
    cropType: row.crop_type,
    weightQuintals: Number(row.weight_quintals),
    moisturePercent: Number(row.moisture_percent),
    residueFormat: row.residue_format,
    latitude: role === 'FARMER' ? 0 : Number(row.latitude),
    longitude: role === 'FARMER' ? 0 : Number(row.longitude),
    status: row.status,
    farmer: { id: row.farmer_id, name: row.farmer_name, phone: role === 'FARMER' ? undefined : row.farmer_phone },
    bids: row.bids ?? [],
  }));
}

stubbleRouter.post('/listings', authenticate, isFarmer, async (req, res) => {
  const parsed = listingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid listing details', issues: parsed.error.issues });

  try {
    const id = `listing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const result = await pool.query(
      `insert into stubble_listings (id, farmer_id, crop_type, weight_quintals, moisture_percent, residue_format, latitude, longitude)
       values ($1,$2,$3,$4,$5,$6::residue_format,$7,$8) returning *`,
      [id, req.user!.id, parsed.data.cropType, parsed.data.weightQuintals, parsed.data.moisturePercent, parsed.data.residueFormat, parsed.data.latitude, parsed.data.longitude],
    );
    return res.status(201).json({ id: result.rows[0].id, status: result.rows[0].status, ...parsed.data });
  } catch (error) {
    console.error('Create listing error:', error);
    return res.status(500).json({ message: 'Could not create listing' });
  }
});

stubbleRouter.get('/listings', authenticate, authorize('FARMER', 'GOVT_BUYER', 'ADMIN'), async (req, res) => {
  if (req.user!.role === 'GOVT_BUYER' && req.user!.kycStatus !== 'APPROVED') {
    return res.status(403).json({ message: 'Verified Government Buyer badge required' });
  }
  try {
    return res.json(await getListings(req.user!.role, req.user!.id));
  } catch (error) {
    console.error('Load listings error:', error);
    return res.status(500).json({ message: 'Could not load listings' });
  }
});

stubbleRouter.patch('/listings/:id/moderate', authenticate, authorize('ADMIN'), async (req, res) => {
  const listingId = String(req.params.id);
  const parsed = z.object({ status: z.enum(['APPROVED', 'REJECTED']), reason: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid moderation status' });

  try {
    const result = await pool.query(
      'update stubble_listings set status=$2::listing_status, rejection_reason=$3, updated_at=now() where id=$1 returning *',
      [listingId, parsed.data.status, parsed.data.reason ?? null],
    );
    if (!result.rows.length) return res.status(404).json({ message: 'Listing not found' });
    return res.json(result.rows[0]);
  } catch {
    return res.status(500).json({ message: 'Could not moderate listing' });
  }
});

stubbleRouter.post('/listings/:id/bids', authenticate, isVerifiedGovtBuyer, async (req, res) => {
  const listingId = String(req.params.id);
  const parsed = z.object({ amountPerQuintal: z.number().positive() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Valid bid amount required' });

  try {
    const listing = await pool.query("select id from stubble_listings where id=$1 and status='APPROVED'", [listingId]);
    if (!listing.rows.length) return res.status(404).json({ message: 'Approved listing not found' });

    const id = `bid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const result = await pool.query(
      `insert into stubble_bids (id, listing_id, buyer_id, amount_per_quintal)
       values ($1,$2,$3,$4)
       on conflict (listing_id,buyer_id) do update set amount_per_quintal=excluded.amount_per_quintal, status='PENDING', updated_at=now()
       returning *`,
      [id, listingId, req.user!.id, parsed.data.amountPerQuintal],
    );
    return res.status(201).json({
      id: result.rows[0].id,
      listingId: result.rows[0].listing_id,
      buyerId: result.rows[0].buyer_id,
      amountPerQuintal: Number(result.rows[0].amount_per_quintal),
      status: result.rows[0].status,
    });
  } catch {
    return res.status(500).json({ message: 'Could not place bid' });
  }
});

stubbleRouter.patch('/bids/:id/accept', authenticate, isFarmer, async (req, res) => {
  const bidId = String(req.params.id);
  const client = await pool.connect();
  try {
    await client.query('begin');
    const bidResult = await client.query(
      `select b.*, l.farmer_id, l.id as listing_id from stubble_bids b
       join stubble_listings l on l.id=b.listing_id where b.id=$1`, [bidId],
    );
    if (!bidResult.rows.length || bidResult.rows[0].farmer_id !== req.user!.id) {
      await client.query('rollback');
      return res.status(404).json({ message: 'Bid not found' });
    }

    await client.query("update stubble_bids set status='ACCEPTED', updated_at=now() where id=$1", [bidId]);
    await client.query("update stubble_bids set status='REJECTED', updated_at=now() where listing_id=$1 and id<>$2", [bidResult.rows[0].listing_id, bidId]);
    await client.query("update stubble_listings set status='SOLD', updated_at=now() where id=$1", [bidResult.rows[0].listing_id]);

    const orderId = `order-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await client.query(
      'insert into stubble_orders (id,listing_id,bid_id,farmer_id,buyer_id,status) values ($1,$2,$3,$4,$5,\'CONFIRMED\') on conflict (listing_id) do update set bid_id=excluded.bid_id, buyer_id=excluded.buyer_id, status=\'CONFIRMED\'',
      [orderId, bidResult.rows[0].listing_id, bidId, bidResult.rows[0].farmer_id, bidResult.rows[0].buyer_id],
    );
    await client.query('commit');
    return res.json({ id: orderId, listingId: bidResult.rows[0].listing_id, bidId, status: 'CONFIRMED' });
  } catch (error) {
    await client.query('rollback');
    console.error('Accept bid error:', error);
    return res.status(500).json({ message: 'Could not accept bid' });
  } finally {
    client.release();
  }
});

stubbleRouter.get('/orders', authenticate, async (req, res) => {
  try {
    let query;
    const values: string[] = [];
    if (req.user!.role === 'FARMER') {
      query = 'select * from stubble_orders where farmer_id=$1 order by created_at desc'; values.push(req.user!.id);
    } else if (req.user!.role === 'GOVT_BUYER') {
      query = 'select * from stubble_orders where buyer_id=$1 order by created_at desc'; values.push(req.user!.id);
    } else {
      query = 'select * from stubble_orders order by created_at desc';
    }
    const result = await pool.query(query, values);
    return res.json(result.rows);
  } catch {
    return res.status(500).json({ message: 'Could not load orders' });
  }
});

stubbleRouter.patch('/orders/:id/status', authenticate, async (req, res) => {
  const parsed = z.object({
    status: z.enum(['PICKUP_SCHEDULED', 'WEIGHBRIDGE_VERIFIED', 'PAYMENT_PENDING', 'SETTLED', 'CANCELLED']),
    verifiedWeightQuintals: z.number().positive().optional(),
    settlementAmount: z.number().positive().optional(),
    bankReference: z.string().optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid order status update' });

  try {
    const result = await pool.query(
      `update stubble_orders set status=$2::order_status, verified_weight_quintals=coalesce($3,verified_weight_quintals), settlement_amount=coalesce($4,settlement_amount), bank_reference=coalesce($5,bank_reference), updated_at=now() where id=$1 returning *`,
      [String(req.params.id), parsed.data.status, parsed.data.verifiedWeightQuintals ?? null, parsed.data.settlementAmount ?? null, parsed.data.bankReference ?? null],
    );
    if (!result.rows.length) return res.status(404).json({ message: 'Order not found' });
    return res.json(result.rows[0]);
  } catch {
    return res.status(500).json({ message: 'Could not update order' });
  }
});
