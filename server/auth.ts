import type { NextFunction, Request, Response } from 'express';

export type Role = 'admin' | 'partner' | 'public';

export function getRole(req: Request): Role {
  const adminToken = process.env.ADMIN_TOKEN ?? '';
  const partnerToken = process.env.PARTNER_TOKEN ?? '';

  // No tokens configured → bypass auth (local dev)
  if (!adminToken && !partnerToken) return 'admin';

  const supplied =
    (req.headers['x-token'] as string | undefined) ??
    (req.query.token as string | undefined) ??
    '';

  if (adminToken && supplied === adminToken) return 'admin';
  if (partnerToken && supplied === partnerToken) return 'partner';
  return 'public';
}

export function requireAuth(allowed: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = getRole(req);
    if (!allowed.includes(role)) {
      return res.status(401).json({ error: 'unauthorized', role });
    }
    (req as Request & { role: Role }).role = role;
    next();
  };
}

// Mutating endpoints that only admin should hit (crawl/sync/notif settings/category mgmt)
export const adminOnly = requireAuth(['admin']);

// Read + partner workflow endpoints — admin OR partner
export const adminOrPartner = requireAuth(['admin', 'partner']);
