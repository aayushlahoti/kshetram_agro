import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

export type Role = 'FARMER' | 'GOVT_BUYER' | 'EQUIPMENT_OFFICER' | 'ADMIN';

export interface AuthUser {
  id: string;
  role: Role;
  kycStatus?: 'NOT_SUBMITTED' | 'PENDING' | 'APPROVED' | 'REJECTED';
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const [scheme, token] = (req.headers.authorization ?? '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET ?? 'development-secret') as AuthUser;
    req.user = { id: payload.id, role: payload.role, kycStatus: payload.kycStatus };
    return next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

export function authorize(...allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have access to this resource' });
    }
    return next();
  };
}

export const isFarmer = authorize('FARMER');
export const isGovtBuyer = authorize('GOVT_BUYER');
export const isAdmin = authorize('ADMIN');

export function isVerifiedGovtBuyer(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ message: 'Authentication required' });
  if (req.user.role !== 'GOVT_BUYER') {
    return res.status(403).json({ message: 'Government buyer access required' });
  }
  if (req.user.kycStatus !== 'APPROVED') {
    return res.status(403).json({ message: 'Verified Government Buyer badge required' });
  }
  return next();
}
