import { Router } from 'express';
import { verifyGoogleLogin, type IdTokenVerifier } from '../auth/google.js';
import { clearSessionCookie, createSessionToken, setSessionCookie } from '../auth/session.js';

export interface AuthRouterOptions {
  verifier: IdTokenVerifier;
  clientId: string;
  allowedEmail: string;
  sessionSecret: string;
  now: () => Date;
}

export function authRouter({ verifier, clientId, allowedEmail, sessionSecret, now }: AuthRouterOptions): Router {
  const router = Router();

  router.post('/google', async (req, res) => {
    const credential = (req.body as { credential?: unknown } | undefined)?.credential;
    if (typeof credential !== 'string' || credential === '') {
      res.status(400).json({ error: 'credential이 필요합니다' });
      return;
    }
    const result = await verifyGoogleLogin(verifier, credential, clientId, allowedEmail);
    if (!result.ok) {
      if (result.reason === 'invalid') {
        res.status(401).json({ error: '로그인 토큰이 유효하지 않습니다' });
      } else {
        res.status(403).json({ error: '이 계정은 사용할 수 없습니다' });
      }
      return;
    }
    setSessionCookie(res, createSessionToken(result.email, sessionSecret, now()));
    res.status(204).end();
  });

  router.post('/logout', (_req, res) => {
    clearSessionCookie(res);
    res.status(204).end();
  });

  return router;
}
