import { OAuth2Client } from 'google-auth-library';

export interface IdTokenPayload {
  email?: string;
  email_verified?: boolean;
}

/** Google이 서명한 ID 토큰을 검증한다. 서명·만료·발급자·audience가 맞지 않으면 예외를 던진다. */
export interface IdTokenVerifier {
  verify(idToken: string, audience: string): Promise<IdTokenPayload>;
}

export function createGoogleIdTokenVerifier(client = new OAuth2Client()): IdTokenVerifier {
  return {
    async verify(idToken, audience) {
      const ticket = await client.verifyIdToken({ idToken, audience });
      const payload = ticket.getPayload();
      if (!payload) throw new Error('ID 토큰 payload가 없습니다');
      return { email: payload.email, email_verified: payload.email_verified };
    },
  };
}

export type LoginResult = { ok: true; email: string } | { ok: false; reason: 'invalid' | 'forbidden' };

/** 로그인용 Google ID 토큰을 검증하고 허용된 단 하나의 계정인지 확인한다. */
export async function verifyGoogleLogin(
  verifier: IdTokenVerifier,
  credential: string,
  clientId: string,
  allowedEmail: string,
): Promise<LoginResult> {
  let payload: IdTokenPayload;
  try {
    payload = await verifier.verify(credential, clientId);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  const email = payload.email?.toLowerCase();
  if (!email || payload.email_verified !== true || email !== allowedEmail.toLowerCase()) {
    return { ok: false, reason: 'forbidden' };
  }
  return { ok: true, email };
}
