import { NextRequest, NextResponse } from "next/server";
import { handleRouteError, jsonError, requireDeviceId, watchUpdateSchema } from "@/lib/server/api";
import { assertSameOrigin } from "@/lib/server/security";
import { deleteWatch, listWatches, upsertWatch } from "@/lib/server/store";

type RouteContext = { params: Promise<{ deadlineId: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const deviceId = await requireDeviceId(request);
    if (!deviceId) return jsonError(401, "A browser session is required");
    const { deadlineId } = await context.params;
    const input = watchUpdateSchema.parse(await request.json());
    const existing = (await listWatches(deviceId)).find((watch) => watch.deadlineId === deadlineId);
    if (!existing) return jsonError(404, "Watch not found");
    const watch = await upsertWatch(
      deviceId,
      deadlineId,
      input.progress ?? existing.progress,
      input.notifyEnabled ?? existing.notifyEnabled,
    );
    return NextResponse.json({ data: watch });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const deviceId = await requireDeviceId(request);
    if (!deviceId) return jsonError(401, "A browser session is required");
    const { deadlineId } = await context.params;
    await deleteWatch(deviceId, deadlineId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
