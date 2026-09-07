import { ZodError, z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { findSession } from "@/lib/server/store";
import { hashSessionToken, sessionCookieName } from "@/lib/server/security";

export const watchInputSchema = z.object({
  deadlineId: z.string().min(1).max(160),
  progress: z.enum(["not_started", "in_progress", "submitted"]).default("not_started"),
  notifyEnabled: z.boolean().default(true),
});

export const watchUpdateSchema = z
  .object({
    progress: z.enum(["not_started", "in_progress", "submitted"]).optional(),
    notifyEnabled: z.boolean().optional(),
  })
  .refine((value) => value.progress !== undefined || value.notifyEnabled !== undefined, {
    message: "At least one field is required",
  });

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(1).max(1024),
    auth: z.string().min(1).max(1024),
  }),
});

export async function requireDeviceId(request: NextRequest) {
  const token = request.cookies.get(sessionCookieName)?.value;
  if (!token) {
    return undefined;
  }

  const session = await findSession(hashSessionToken(token));
  if (!session || session.expiresAt <= Math.floor(Date.now() / 1000)) {
    return undefined;
  }
  return session.deviceId;
}

export function jsonError(status: number, message: string) {
  return NextResponse.json({ error: { message } }, { status });
}

export function handleRouteError(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: { message: "Invalid request", details: error.flatten() } },
      { status: 422 },
    );
  }
  if (error instanceof Error && error.message === "Origin validation failed") {
    return jsonError(403, "Invalid request origin");
  }
  if (error instanceof Error && error.name === "ConditionalCheckFailedException") {
    return jsonError(404, "Watch not found");
  }
  console.error(error);
  return jsonError(500, "Unexpected server error");
}
