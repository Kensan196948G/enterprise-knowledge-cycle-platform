import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { Role } from "./rbac.js";

const JWT_SECRET = process.env.JWT_SECRET ?? "ekcp-dev-secret-change-me";
const JWT_TTL_SECONDS = 60 * 60 * 8;

/**
 * AUTH_MODE=open の場合、パスワード検証を省略する(MVP検証環境を
 * 誰でも閲覧・操作できるようにするための明示的なフラグ)。
 * 既定は "secure"(fail-closed)。本番相当の環境では必ず未設定のままにする。
 */
export function isAuthOpen(): boolean {
  return process.env.AUTH_MODE === "open";
}

export interface AuthTokenPayload {
  sub: string;
  role: Role;
  name: string;
}

export function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_TTL_SECONDS });
}

export function verifyToken(token: string): AuthTokenPayload {
  return jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
