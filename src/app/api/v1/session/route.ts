import { NextRequest, NextResponse } from "next/server";
import { createDeviceId, createSessionToken, hashSessionToken, sessionCookieName, setSessionCookie } from "@/lib/server/security";
import { assertSameOrigin } from "@/lib/server/security";
import { createSession, findSession } from "@/lib/server/store";
import { handleRouteError } from "@/lib/server/api";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const existingToken = request.cookies.get(sessionCookieName)?.value;
    const existingSession = existingToken && await findSession(hashSessionToken(existingToken));
    if (existingSession && existingSession.expiresAt > Math.floor(Date.now() / 1000)) {
      return NextResponse.json({ ok: true });
    }
    const token = createSessionToken();
    await createSession(hashSessionToken(token), createDeviceId());
    const response = NextResponse.json({ ok: true }, { status: 201 });
    setSessionCookie(response, token);
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
