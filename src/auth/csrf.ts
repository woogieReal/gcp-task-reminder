import type { RequestHandler } from 'express';

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * 상태를 바꾸는 요청은 JSON이어야 하고 Origin이 허용 목록과 일치해야 한다.
 * 다른 사이트의 form 전송은 JSON Content-Type을 만들 수 없고, fetch는 Origin을 숨길 수 없다.
 */
export function csrfProtection(allowedOrigins: readonly string[]): RequestHandler {
  const allowed = new Set(allowedOrigins);
  return (req, res, next) => {
    if (!STATE_CHANGING.has(req.method)) {
      next();
      return;
    }
    const contentType = req.get('Content-Type')?.split(';')[0]?.trim().toLowerCase();
    const origin = req.get('Origin');
    if (contentType !== 'application/json' || !origin || !allowed.has(origin)) {
      res.status(403).json({ error: '허용되지 않은 요청입니다' });
      return;
    }
    next();
  };
}
