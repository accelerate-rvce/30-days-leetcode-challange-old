import bcrypt from "bcryptjs";
import { randomBytes, createHash } from "node:crypto";

export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
