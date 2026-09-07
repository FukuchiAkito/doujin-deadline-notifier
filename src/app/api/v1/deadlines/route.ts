import { NextResponse } from "next/server";
import { listDeadlines } from "@/lib/server/store";
import { handleRouteError } from "@/lib/server/api";

export async function GET() {
  try {
    const deadlines = await listDeadlines();
    return NextResponse.json({ data: deadlines });
  } catch (error) {
    return handleRouteError(error);
  }
}
