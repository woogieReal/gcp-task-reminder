import type { RequestHandler } from 'express';
import type { IdTokenVerifier } from './google.js';

export interface TriggerAuthOptions {
  verifier: IdTokenVerifier;
  /** Cloud Tasks가 토큰에 넣는 audience (= SERVICE_URL) */
  audience: string;
  /** 토큰을 발급한 서비스 계정 (= TASKS_INVOKER_SA_EMAIL) */
  invokerEmail: string;
  /** 로컬 개발 전용. config에서 NODE_ENV=development일 때만 true가 된다. */
  skip: boolean;
}

/** Cloud Tasks가 붙인 OIDC 토큰을 검증한다. Cloud Run이 공개 상태라 앱에서 직접 확인해야 한다. */
export function requireTriggerAuth({ verifier, audience, invokerEmail, skip }: TriggerAuthOptions): RequestHandler {
  return async (req, res, next) => {
    if (skip) {
      next();
      return;
    }
    const match = /^Bearer (.+)$/.exec(req.get('Authorization') ?? '');
    if (!match?.[1]) {
      res.status(401).json({ error: '인증 토큰이 필요합니다' });
      return;
    }
    try {
      const payload = await verifier.verify(match[1], audience);
      if (payload.email_verified !== true || payload.email?.toLowerCase() !== invokerEmail.toLowerCase()) {
        throw new Error('허용되지 않은 발급 주체');
      }
    } catch (err) {
      console.error(`trigger: OIDC 검증 실패: ${(err as Error).message}`);
      res.status(401).json({ error: '인증에 실패했습니다' });
      return;
    }
    next();
  };
}
