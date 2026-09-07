import { NextRequest, NextResponse } from "next/server";
import { handleRouteError, jsonError, requireDeviceId, watchInputSchema } from "@/lib/server/api";
import { assertSameOrigin } from "@/lib/server/security";
import { getDeadline, listWatches, upsertWatch } from "@/lib/server/store";

export async function GET(request: NextRequest) {
  try {
    const deviceId = await requireDeviceId(request);
    if (!deviceId) return jsonError(401, "A browser session is required");
    return NextResponse.json({ data: await listWatches(deviceId) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const deviceId = await requireDeviceId(request);
    if (!deviceId) return jsonError(401, "A browser session is required");
    const input = watchInputSchema.parse(await request.json());
    if (!(await getDeadline(input.deadlineId))) return jsonError(404, "Deadline not found");
    const watch = await upsertWatch(deviceId, input.deadlineId, input.progress, input.notifyEnabled);
    return NextResponse.json({ data: watch }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
