import { randomInt } from 'node:crypto';
import { Router } from 'express';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { z } from 'zod';
import { pool } from '../../config/database.js';
import { authenticate, authorize } from '../../middleware/auth.js';

export const authRouter = Router();

type Role = 'FARMER' | 'GOVT_BUYER' | 'EQUIPMENT_OFFICER' | 'ADMIN';
type KycStatus = 'NOT_SUBMITTED' | 'PENDING' | 'APPROVED' | 'REJECTED';

interface TemporaryUser {
  id: string;
  phone: string;
  name?: string;
  role: Role;
  kycStatus: KycStatus;
  kycReference?: string;
}

interface TemporaryOtp {
  code: string;
  expiresAt: number;
  mode: 'signin' | 'signup';
  attempts: number;
}

interface MemoryUser {
  id: string;
  phone: string;
  name: string | null;
  role: Role;
  kyc_status: KycStatus;
  kyc_reference: string | null;
}

const temporaryOtps = new Map<string, TemporaryOtp>();
const memoryUsers = new Map<string, MemoryUser>();

const phoneSchema = z.object({
  phone: z.string().trim().transform((value) => value.replace(/\D/g, '').slice(-15)).refine((value) => value.length >= 10 && value.length <= 15, 'Valid mobile number required'),
  mode: z.enum(['signin', 'signup']).optional(),
  name: z.string().trim().optional(),
});

async function sendOtp(phone: string, mode: 'signin' | 'signup') {
  const code = String(randomInt(100000, 1000000));
  const ttlSeconds = Math.max(30, Number(process.env.OTP_TTL_SECONDS ?? 300));
  temporaryOtps.set(phone, { code, expiresAt: Date.now() + ttlSeconds * 1000, mode, attempts: 0 });
  return code;
}

function verifyOtp(phone: string, code: string, mode: 'signin' | 'signup') {
  const otp = temporaryOtps.get(phone);
  if (!otp || otp.expiresAt < Date.now()) {
    temporaryOtps.delete(phone);
    return false;
  }
  if (otp.mode !== mode) return false;

  otp.attempts += 1;
  if (otp.attempts > 5) {
    temporaryOtps.delete(phone);
    return false;
  }
  if (otp.code !== code) return false;

  temporaryOtps.delete(phone);
  return true;
}

function mapUser(row: any): TemporaryUser {
  return {
    id: row.id,
    phone: row.phone,
    name: row.name ?? undefined,
    role: row.role,
    kycStatus: row.kyc_status,
    kycReference: row.kyc_reference ?? undefined,
  };
}

authRouter.post('/otp/request', async (req, res) => {
  const parsed = phoneSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Valid mobile number required' });

  const mode = parsed.data.mode ?? 'signin';
  if (mode === 'signup' && (!parsed.data.name || parsed.data.name.length < 2)) {
    return res.status(400).json({ message: 'Full name is required for sign up' });
  }

  try {
    let existingRows: any[] = [];
    try {
      const existing = await pool.query('select id from users where phone = $1', [parsed.data.phone]);
      existingRows = existing.rows;
    } catch {
      existingRows = memoryUsers.has(parsed.data.phone) ? [{ id: memoryUsers.get(parsed.data.phone)!.id }] : [];
    }

    if (mode === 'signup' && existingRows.length > 0) {
      return res.status(409).json({ message: 'This mobile number is already registered. Please sign in.' });
    }
    if (mode === 'signin' && existingRows.length === 0) {
      return res.status(404).json({ message: 'No account found for this mobile number. Please sign up.' });
    }

    const code = await sendOtp(parsed.data.phone, mode);
    return res.status(200).json({
      message: 'OTP generated successfully',
      demo: true,
      code,
    });
  } catch (error) {
    console.error('OTP request error:', error);
    const message = error instanceof Error ? error.message : 'Could not generate OTP';
    return res.status(500).json({ message });
  }
});

authRouter.post('/otp/verify', async (req, res) => {
  const parsed = z.object({
    phone: z.string().trim().transform((value) => value.replace(/\D/g, '').slice(-15)).refine((value) => value.length >= 10 && value.length <= 15, 'Valid mobile number required'),
    code: z.string().trim().regex(/^\d{6}$/),
    role: z.enum(['FARMER', 'GOVT_BUYER', 'EQUIPMENT_OFFICER', 'ADMIN']).optional(),
    mode: z.enum(['signin', 'signup']).optional(),
    name: z.string().trim().optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Valid mobile number and 6-digit OTP required' });

  const mode = parsed.data.mode ?? 'signin';
  if (mode === 'signup' && (!parsed.data.name || parsed.data.name.length < 2)) {
    return res.status(400).json({ message: 'Full name is required for sign up' });
  }

  try {
    if (!verifyOtp(parsed.data.phone, parsed.data.code, mode)) {
      return res.status(401).json({ message: 'Invalid or expired OTP' });
    }

    const requestedRole = parsed.data.role ?? 'FARMER';
    const id = `user-${parsed.data.phone}`;
    let userRow: any;

    try {
      const existing = await pool.query('select * from users where phone = $1', [parsed.data.phone]);

      if (mode === 'signin' && existing.rows.length === 0) {
        return res.status(404).json({ message: 'No account found for this mobile number. Please sign up.' });
      }

      if (existing.rows.length > 0) {
        const existingRole = existing.rows[0].role as Role;
        const result = await pool.query(
          'update users set name = coalesce($2, name), role = $3::user_role, updated_at = now() where phone = $1 returning *',
          [parsed.data.phone, mode === 'signup' ? parsed.data.name : null, mode === 'signin' ? existingRole : requestedRole],
        );
        userRow = result.rows[0];
      } else {
        if (mode !== 'signup') {
          return res.status(404).json({ message: 'No account found for this mobile number. Please sign up.' });
        }
        const result = await pool.query(
          'insert into users (id, phone, name, role, kyc_status) values ($1, $2, $3, $4::user_role, $5::kyc_status) returning *',
          [id, parsed.data.phone, parsed.data.name ?? null, requestedRole, requestedRole === 'GOVT_BUYER' ? 'APPROVED' : 'NOT_SUBMITTED'],
        );
        userRow = result.rows[0];
      }
    } catch (databaseError) {
      const existing = memoryUsers.get(parsed.data.phone);
      if (mode === 'signin' && !existing) {
        return res.status(404).json({ message: 'No account found for this mobile number. Please sign up.' });
      }

      if (existing) {
        existing.name = mode === 'signup' ? (parsed.data.name ?? existing.name) : existing.name;
        userRow = existing;
      } else {
        userRow = {
          id,
          phone: parsed.data.phone,
          name: parsed.data.name ?? null,
          role: requestedRole,
          kyc_status: requestedRole === 'GOVT_BUYER' ? 'APPROVED' : 'NOT_SUBMITTED',
          kyc_reference: null,
        };
        memoryUsers.set(parsed.data.phone, userRow);
      }
    }

    const user = mapUser(userRow);
    const token = jwt.sign(
      { id: user.id, role: user.role, kycStatus: user.kycStatus, phone: user.phone, name: user.name },
      process.env.JWT_SECRET ?? 'development-secret',
      { expiresIn: (process.env.JWT_EXPIRES_IN ?? '15m') as SignOptions['expiresIn'] },
    );

    return res.json({ token, user });
  } catch (error) {
    console.error('OTP verification database error:', error);
    const message = error instanceof Error ? error.message : 'Could not verify OTP';
    return res.status(500).json({ message });
  }
});

authRouter.get('/me', authenticate, async (req, res) => {
  try {
    const result = await pool.query('select * from users where id = $1', [req.user!.id]);
    return res.json({ user: result.rows.length ? mapUser(result.rows[0]) : req.user });
  } catch {
    return res.status(500).json({ message: 'Could not load account' });
  }
});

authRouter.post('/kyc/submit', authenticate, authorize('GOVT_BUYER'), async (req, res) => {
  const parsed = z.object({ reference: z.string().min(3) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'KYC reference required' });

  try {
    await pool.query("update users set kyc_reference = $2, kyc_status = 'PENDING'::kyc_status, updated_at = now() where id = $1", [req.user!.id, parsed.data.reference]);
    return res.json({ kycStatus: 'PENDING', kycReference: parsed.data.reference });
  } catch {
    return res.status(500).json({ message: 'Could not submit KYC' });
  }
});

authRouter.patch('/kyc/:userId/moderate', authenticate, authorize('ADMIN'), async (req, res) => {
  const userId = String(req.params.userId);
  const parsed = z.object({ status: z.enum(['APPROVED', 'REJECTED']) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid KYC status' });

  try {
    await pool.query('update users set kyc_status = $2::kyc_status, updated_at = now() where id = $1', [userId, parsed.data.status]);
    return res.json({ id: userId, kycStatus: parsed.data.status });
  } catch {
    return res.status(500).json({ message: 'Could not update KYC status' });
  }
});
