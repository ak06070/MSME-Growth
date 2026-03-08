import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { Membership, PermissionKey, RoleKey, SessionRecord, User } from "@msme/types";
import type { AuthContext } from "./auth-store";
import { InMemoryAuthStore } from "./auth-store";

interface TokenClaims {
  sub: string;
  tenantId: string;
  organizationId: string;
  roles: RoleKey[];
  iat: number;
  exp: number;
  jti: string;
}

const base64UrlEncode = (input: string): string => {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
};

const base64UrlDecode = (input: string): string => {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(normalized + "=".repeat(padLength), "base64").toString("utf8");
};

const sign = (message: string, secret: string): string => {
  return createHmac("sha256", secret)
    .update(message)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
};

const safeEqual = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
};

const buildAuthContext = (
  user: User,
  membership: Membership,
  permissions: PermissionKey[],
  session: SessionRecord
): AuthContext => {
  return {
    user,
    membership,
    permissions,
    session
  };
};

export class HmacTokenAuthProvider {
  private readonly tokenTtlSeconds: number;

  constructor(
    private readonly authStore: InMemoryAuthStore,
    private readonly secret: string,
    tokenTtlSeconds = 60 * 60
  ) {
    this.tokenTtlSeconds = tokenTtlSeconds;
  }

  issueToken(input: {
    userId: string;
    tenantId: string;
    organizationId: string;
    roles: RoleKey[];
  }): string {
    const header = {
      alg: "HS256",
      typ: "JWT"
    };

    const issuedAt = Math.floor(Date.now() / 1000);
    const claims: TokenClaims = {
      sub: input.userId,
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      roles: input.roles,
      iat: issuedAt,
      exp: issuedAt + this.tokenTtlSeconds,
      jti: randomUUID()
    };

    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(claims));
    const signature = sign(`${encodedHeader}.${encodedPayload}`, this.secret);

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  resolveAuthContext(token: string): AuthContext | null {
    const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");

    if (!encodedHeader || !encodedPayload || !encodedSignature) {
      return null;
    }

    const expectedSignature = sign(`${encodedHeader}.${encodedPayload}`, this.secret);

    if (!safeEqual(encodedSignature, expectedSignature)) {
      return null;
    }

    let claims: TokenClaims;

    try {
      claims = JSON.parse(base64UrlDecode(encodedPayload)) as TokenClaims;
    } catch {
      return null;
    }

    if (claims.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    const user = this.authStore.getUserById(claims.sub);

    if (!user || user.status !== "active") {
      return null;
    }

    const membership = this.authStore.getMembershipForUser(
      user.id,
      claims.tenantId,
      claims.organizationId
    );

    if (!membership) {
      return null;
    }

    const permissions = this.authStore.getPermissions(membership.roles);
    const session: SessionRecord = {
      id: `token:${claims.jti}`,
      userId: user.id,
      tenantId: membership.tenantId,
      organizationId: membership.organizationId,
      expiresAt: new Date(claims.exp * 1000).toISOString()
    };

    return buildAuthContext(user, membership, permissions, session);
  }
}
