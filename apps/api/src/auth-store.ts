import { randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import type {
  Membership,
  Organization,
  PermissionKey,
  RoleKey,
  SessionRecord,
  Tenant,
  User,
  UserStatus
} from "@msme/types";

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const PASSWORD_SALT = "msme-growth-foundation-salt";

const ROLE_PERMISSIONS: Record<RoleKey, PermissionKey[]> = {
  owner: [
    "users:invite",
    "users:read",
    "users:update",
    "users:suspend",
    "roles:assign",
    "audit:read"
  ],
  admin: [
    "users:invite",
    "users:read",
    "users:update",
    "users:suspend",
    "roles:assign",
    "audit:read"
  ],
  finance_manager: ["users:read"],
  accountant: ["users:read"],
  collections_agent: [],
  auditor: ["audit:read"]
};

export interface AuthContext {
  session: SessionRecord;
  user: User;
  membership: Membership;
  permissions: PermissionKey[];
}

const nowIso = (): string => new Date().toISOString();

const hashPassword = (password: string): string => {
  return scryptSync(password, PASSWORD_SALT, 64).toString("hex");
};

const verifyPassword = (password: string, hash: string): boolean => {
  const computed = hashPassword(password);
  const left = Buffer.from(computed, "hex");
  const right = Buffer.from(hash, "hex");

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
};

export class InMemoryAuthStore {
  private readonly users = new Map<string, User>();
  private readonly usersByEmail = new Map<string, string>();
  private readonly tenants = new Map<string, Tenant>();
  private readonly organizations = new Map<string, Organization>();
  private readonly memberships = new Map<string, Membership>();
  private readonly sessions = new Map<string, SessionRecord>();

  constructor() {
    this.seed();
  }

  private seed(): void {
    const tenant: Tenant = {
      id: "ten_001",
      name: "Pilot Tenant",
      status: "active"
    };
    const org: Organization = {
      id: "org_001",
      tenantId: tenant.id,
      name: "Pilot Organization"
    };

    this.tenants.set(tenant.id, tenant);
    this.organizations.set(org.id, org);

    this.tenants.set("ten_002", {
      id: "ten_002",
      name: "Secondary Tenant",
      status: "active"
    });
    this.organizations.set("org_002", {
      id: "org_002",
      tenantId: "ten_002",
      name: "Secondary Organization"
    });

    this.createUser({
      id: "usr_admin",
      email: "admin@msme.local",
      password: "Admin@123",
      status: "active"
    });

    this.createUser({
      id: "usr_finance",
      email: "finance@msme.local",
      password: "Finance@123",
      status: "active"
    });

    this.createMembership({
      id: "mem_admin",
      userId: "usr_admin",
      tenantId: tenant.id,
      organizationId: org.id,
      roles: ["admin"],
      isActive: true
    });

    this.createMembership({
      id: "mem_finance",
      userId: "usr_finance",
      tenantId: tenant.id,
      organizationId: org.id,
      roles: ["finance_manager"],
      isActive: true
    });
  }

  private createUser(input: {
    id: string;
    email: string;
    password: string;
    status: UserStatus;
  }): User {
    const user: User = {
      id: input.id,
      email: input.email,
      passwordHash: hashPassword(input.password),
      status: input.status,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };

    this.users.set(user.id, user);
    this.usersByEmail.set(user.email.toLowerCase(), user.id);

    return user;
  }

  private createMembership(input: Membership): Membership {
    this.memberships.set(input.id, input);
    return input;
  }

  getUserById(userId: string): User | undefined {
    return this.users.get(userId);
  }

  getUserByEmail(email: string): User | undefined {
    const userId = this.usersByEmail.get(email.toLowerCase());
    return userId ? this.users.get(userId) : undefined;
  }

  getMembershipForUser(userId: string, tenantId: string, organizationId: string): Membership | undefined {
    return [...this.memberships.values()].find(
      (membership) =>
        membership.userId === userId &&
        membership.tenantId === tenantId &&
        membership.organizationId === organizationId &&
        membership.isActive
    );
  }

  getDefaultMembership(userId: string): Membership | undefined {
    return [...this.memberships.values()].find(
      (membership) => membership.userId === userId && membership.isActive
    );
  }

  authenticate(email: string, password: string):
    | { ok: true; user: User; membership: Membership }
    | { ok: false; reason: "invalid_credentials" | "inactive_user" | "no_membership" } {
    const user = this.getUserByEmail(email);

    if (!user || !verifyPassword(password, user.passwordHash)) {
      return { ok: false, reason: "invalid_credentials" };
    }

    if (user.status !== "active") {
      return { ok: false, reason: "inactive_user" };
    }

    const membership = this.getDefaultMembership(user.id);

    if (!membership) {
      return { ok: false, reason: "no_membership" };
    }

    return { ok: true, user, membership };
  }

  createSession(user: User, membership: Membership): SessionRecord {
    const session: SessionRecord = {
      id: randomUUID(),
      userId: user.id,
      tenantId: membership.tenantId,
      organizationId: membership.organizationId,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString()
    };

    this.sessions.set(session.id, session);
    return session;
  }

  getSession(sessionId: string): SessionRecord | undefined {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return undefined;
    }

    if (session.revokedAt) {
      return undefined;
    }

    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      return undefined;
    }

    return session;
  }

  revokeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return;
    }

    session.revokedAt = nowIso();
    this.sessions.set(sessionId, session);
  }

  revokeUserSessions(userId: string): void {
    for (const session of this.sessions.values()) {
      if (session.userId === userId && !session.revokedAt) {
        session.revokedAt = nowIso();
      }
    }
  }

  resolveAuthContext(sessionId: string): AuthContext | null {
    const session = this.getSession(sessionId);

    if (!session) {
      return null;
    }

    const user = this.getUserById(session.userId);
    if (!user || user.status !== "active") {
      return null;
    }

    const membership = this.getMembershipForUser(
      session.userId,
      session.tenantId,
      session.organizationId
    );

    if (!membership) {
      return null;
    }

    const permissions = this.getPermissions(membership.roles);

    return {
      session,
      user,
      membership,
      permissions
    };
  }

  getPermissions(roles: RoleKey[]): PermissionKey[] {
    return [...new Set(roles.flatMap((role) => ROLE_PERMISSIONS[role]))];
  }

  userHasPermission(userId: string, tenantId: string, organizationId: string, permission: PermissionKey): boolean {
    const membership = this.getMembershipForUser(userId, tenantId, organizationId);

    if (!membership) {
      return false;
    }

    return this.getPermissions(membership.roles).includes(permission);
  }

  inviteUser(input: {
    email: string;
    tenantId: string;
    organizationId: string;
    role: RoleKey;
  }): { inviteId: string; user: User } {
    const user = this.createUser({
      id: randomUUID(),
      email: input.email,
      password: randomUUID(),
      status: "invited"
    });

    this.createMembership({
      id: randomUUID(),
      userId: user.id,
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      roles: [input.role],
      isActive: true
    });

    return {
      inviteId: randomUUID(),
      user
    };
  }

  assignRole(input: { userId: string; tenantId: string; organizationId: string; role: RoleKey }): Membership | null {
    const membership = this.getMembershipForUser(input.userId, input.tenantId, input.organizationId);

    if (!membership) {
      return null;
    }

    if (!membership.roles.includes(input.role)) {
      membership.roles = [...membership.roles, input.role];
      this.memberships.set(membership.id, membership);
    }

    return membership;
  }

  updateUserStatus(input: { userId: string; status: UserStatus }): User | null {
    const user = this.getUserById(input.userId);

    if (!user) {
      return null;
    }

    user.status = input.status;
    user.updatedAt = nowIso();
    this.users.set(user.id, user);

    if (input.status === "suspended" || input.status === "deactivated") {
      this.revokeUserSessions(user.id);
    }

    return user;
  }

  isKnownTenantOrg(tenantId: string, organizationId: string): boolean {
    const tenant = this.tenants.get(tenantId);
    const org = this.organizations.get(organizationId);

    return Boolean(tenant && org && org.tenantId === tenant.id);
  }
}
