import { NextResponse } from "next/server";
import { apiSession, json401 } from "@/lib/api-auth";
import { isQaLead } from "@/lib/qa-lead";

export async function GET() {
  const user = await apiSession();
  if (!user) return json401();
  // `isQaLead` dibaca dari DB (bukan JWT) supaya perubahan flag di Settings
  // langsung terpakai oleh sidebar tanpa login ulang.
  return NextResponse.json({ ...user, isQaLead: await isQaLead(user.id) });
}

export const dynamic = "force-dynamic";
