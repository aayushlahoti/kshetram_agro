import { Router } from 'express';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { z } from 'zod';
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

const temporaryOtps = new Map<string, { code: string; expiresAt: number }>();
const temporaryUsers = new Map<string, TemporaryUser>();

const phoneSchema = z.object({
  phone: z.string().trim().transform((value) => value.replace(/\D/g, '').slice(-15)).refine((value) => value.length >= 10 && value.length <= 15, 'Valid phone number required'),
  mode: z.enum(['signin', 'signup']).optional(),
  name: z.string().trim().optional(),
});

function findUserById(id: string) {
  return [...temporaryUsers.values()].find((item) => item.id === id);
}

authRouter.post('/otp/request', (req, res) => {
  const parsed = phoneSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Valid phone number required' });

  if (parsed.data.mode === 'signup' && (!parsed.data.name || parsed.data.name.length < 2)) {
    return res.status(400).json({ message: 'Full name is required for sign up' });
  }

  const code = '123456';
  temporaryOtps.set(parsed.data.phone, {
    code,
    expiresAt: Date.now() + Number(process.env.OTP_TTL_SECONDS ?? 300) * 1000,
  });

  return res.status(200).json({
    message: process.env.NODE_ENV === 'production' ? 'OTP sent successfully' : 'Demo OTP sent successfully',
    code,
  });
});

authRouter.post('/otp/verify', (req, res) => {
  const parsed = z.object({
    phone: z.string().trim().transform((value) => value.replace(/\D/g, '').slice(-15)).refine((value) => value.length >= 10 && value.length <= 15, 'Valid phone number required'),
    code: z.string().trim().regex(/^\d{6}$/),
    role: z.enum(['FARMER', 'GOVT_BUYER', 'EQUIPMENT_OFFICER', 'ADMIN']).optional(),
    mode: z.enum(['signin', 'signup']).optional(),
    name: z.string().trim().optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Valid phone number and 6-digit OTP required' });

  if (parsed.data.mode === 'signup' && (!parsed.data.name || parsed.data.name.length < 2)) {
    return res.status(400).json({ message: 'Full name is required for sign up' });
  }

  const otp = temporaryOtps.get(parsed.data.phone);
  if (!otp || otp.code !== parsed.data.code || otp.expiresAt < Date.now()) {
    temporaryOtps.delete(parsed.data.phone);
    return res.status(401).json({ message: 'Invalid or expired OTP' });
  }

  temporaryOtps.delete(parsed.data.phone);
  const role = parsed.data.role ?? 'FARMER';
  const existing = temporaryUsers.get(parsed.data.phone);
  const user: TemporaryUser = {
    id: existing?.id ?? `temp-${parsed.data.phone}`,
    phone: parsed.data.phone,
    name: parsed.data.name ?? existing?.name,
    role,
    kycStatus: existing?.kycStatus ?? (role === 'GOVT_BUYER' ? 'APPROVED' : 'NOT_SUBMITTED'),
  };
  temporaryUsers.set(parsed.data.phone, user);

  const token = jwt.sign(
    { id: user.id, role: user.role, kycStatus: user.kycStatus, phone: user.phone, name: user.name },
    process.env.JWT_SECRET ?? 'development-secret',
    { expiresIn: (process.env.JWT_EXPIRES_IN ?? '15m') as SignOptions['expiresIn'] },
  );

  return res.json({ token, user });
});

authRouter.get('/me', authenticate, (req, res) => {
  const user = req.user ? findUserById(req.user.id) : undefined;
  return res.json({ user: user ?? req.user });
});

authRouter.post('/kyc/submit', authenticate, authorize('GOVT_BUYER'), (req, res) => {
  const parsed = z.object({ reference: z.string().min(3) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'KYC reference required' });

  const user = req.user ? findUserById(req.user.id) : undefined;
  if (user) {
    user.kycReference = parsed.data.reference;
    user.kycStatus = 'PENDING';
  }
  return res.json({ kycStatus: 'PENDING', kycReference: parsed.data.reference });
});

authRouter.patch('/kyc/:userId/moderate', authenticate, authorize('ADMIN'), (req, res) => {
  const userId = String(req.params.userId);
  const parsed = z.object({ status: z.enum(['APPROVED', 'REJECTED']) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid KYC status' });

  const user = findUserById(userId);
  if (user) user.kycStatus = parsed.data.status;
  return res.json({ id: userId, kycStatus: parsed.data.status });
});
