import { supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";

export async function GET() {
  const { data, error } = await supabase
    .from("users")
    .select("*");

  if (error) {
    return NextResponse.json({ error });
  }

  return NextResponse.json({ data });
}