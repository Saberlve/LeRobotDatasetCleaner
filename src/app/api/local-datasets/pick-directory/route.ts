import { NextResponse } from "next/server";

import { pickDirectory } from "@/server/local-datasets/picker";

export async function POST() {
  const result = await pickDirectory();

  if (result.error) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json(result);
}
