import { createHash, randomBytes, randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/server/config";

export const sessionCookieName = process.env.NODE_ENV === "production" ? "__Host-ddn_session" : "ddn_session";

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createDeviceId() {
  return randomUUID();
}

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(sessionCookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
}

export function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const expectedOrigin = config.appOrigin ?? request.nextUrl.origin;

  if (origin && origin !== expectedOrigin) {
    throw new Error("Origin validation failed");
  }
}
