import { getConnection } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    await getConnection();
  } catch {
    // Liveness should succeed even before hydration completes.
  }
  return Response.json({ status: "ok" });
}
