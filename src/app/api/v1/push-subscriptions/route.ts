import { NextRequest, NextResponse } from "next/server";
import { handleRouteError, jsonError, pushSubscriptionSchema, requireDeviceId } from "@/lib/server/api";
import { assertSameOrigin } from "@/lib/server/security";
import { savePushSubscription } from "@/lib/server/store";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const deviceId = await requireDeviceId(request);
    if (!deviceId) return jsonError(401, "A browser session is required");
    const subscription = pushSubscriptionSchema.parse(await request.json());
    await savePushSubscription(deviceId, subscription);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
