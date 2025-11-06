import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export interface JWTPayload {
  sub: string;
  email: string;
  role?: string;
  primaryRole?: string;
  roles?: string[];
  clientIds?: string[];
  tenantId: string;
  tenantSlug?: string;
  firstName?: string;
  lastName?: string;
  scopes?: string[];
}

export function signJwt(payload: JWTPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: "7d",
  });
}

export function verifyJwt(token: string): JWTPayload {
  return jwt.verify(token, env.JWT_SECRET) as JWTPayload;
}
