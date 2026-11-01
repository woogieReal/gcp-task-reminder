import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';

export const SESSION_COOKIE = 'reminder_session';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface SessionPayload {
  email: string;
  exp: number;
}

function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

/** `<base64url(payload)>.<base64url(HMAC-SHA256)>` 형식의 세션 토큰. 서버 저장소 없이 검증한다. */
export function createSessionToken(email: string, secret: string, now: Date): string {
  const payload: SessionPayload = { email, exp: now.getTime() + SESSION_TTL_MS };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${data}.${sign(data, secret)}`;
}

export function verifySessionToken(token: string, secret: string, now: Date): { email: string } | null {
  const [data, signature, ...rest] = token.split('.');
  if (!data || !signature || rest.length > 0) return null;

  const expected = Buffer.from(sign(data, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as Partial<SessionPayload>;
    if (typeof payload.email !== 'string' || typeof payload.exp !== 'number') return null;
    if (payload.exp <= now.getTime()) return null;
    return { email: payload.email };
  } catch {
    return null;
  }
}

const cookieOptions = { httpOnly: true, secure: true, sameSite: 'lax', path: '/' } as const;

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_TTL_MS });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, cookieOptions);
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return undefined;
}

/** 유효한 세션이 없으면 401. 통과하면 `res.locals.email`에 로그인한 이메일을 담는다. */
export function requireSession(secret: string, now: () => Date): RequestHandler {
  return (req, res, next) => {
    const token = readCookie(req, SESSION_COOKIE);
    const session = token ? verifySessionToken(token, secret, now()) : null;
    if (!session) {
      res.status(401).json({ error: '로그인이 필요합니다' });
      return;
    }
    res.locals.email = session.email;
    next();
  };
}
