import { NextResponse } from "next/server";
import { apiSession, json401 } from "@/lib/api-auth";

export async function GET() {
  const user = await apiSession();
  if (!user) return json401();
  return NextResponse.json(user);
}

export const dynamic = "force-dynamic";
