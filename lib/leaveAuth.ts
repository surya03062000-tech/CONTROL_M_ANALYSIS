// Session + password helpers for the Leave Request module (server-side only).
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import type { NextRequest } from "next/server";

const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET || "leave-dev-insecure-secret-change-me"
);

export const SESSION_COOKIE = "leave_session";
export type Role = "employee" | "admin";
export interface Session { username: string; role: Role; name: string; }

export async function createToken(s: Session): Promise<string> {
  return new SignJWT({ role: s.role, name: s.name })
    .setSubject(s.username)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secret);
}

export async function verifyToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return { username: String(payload.sub), role: payload.role as Role, name: String(payload.name || payload.sub) };
  } catch {
    return null;
  }
}

export async function getSession(req: NextRequest): Promise<Session | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export function cookieOptions(maxAgeSeconds = 8 * 60 * 60) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try { return await bcrypt.compare(plain, hash); } catch { return false; }
}
