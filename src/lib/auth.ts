import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import type { Request } from "express";
import { prisma } from "./prisma";
import type { Role } from "./roles";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  orgName: string | null;
};

function sessionKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET must be set (16+ chars)");
  }
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}

export async function signToken(user: SessionUser) {
  return new SignJWT({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    orgName: user.orgName,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(sessionKey());
}

export async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, sessionKey());
    return {
      id: String(payload.id),
      email: String(payload.email),
      name: String(payload.name),
      role: payload.role as Role,
      orgName: (payload.orgName as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

export function getBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7).trim() || null;
}

export async function getSession(req: Request): Promise<SessionUser | null> {
  const token = getBearer(req);
  if (!token) return null;
  return verifyToken(token);
}

export async function requireUser(req: Request, roles?: Role[]) {
  const user = await getSession(req);
  if (!user) throw new AuthError("Unauthorized", 401);
  if (roles && !roles.includes(user.role)) throw new AuthError("Forbidden", 403);
  return user;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function authenticate(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });
  if (!user) return null;
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as Role,
    orgName: user.orgName,
  } satisfies SessionUser;
}
