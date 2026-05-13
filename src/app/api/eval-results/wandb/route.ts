import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

const WANDB_DATA_ROOT = path.resolve(process.cwd(), "eval_results");

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const runId = searchParams.get("runId");

  try {
    if (runId) {
      const historyPath = path.join(WANDB_DATA_ROOT, "wandb_histories", `${runId}.json`);
      try {
        const content = await readFile(historyPath, "utf8");
        return NextResponse.json(JSON.parse(content));
      } catch {
        return NextResponse.json([]);
      }
    }
 else {
      const csvPath = path.join(WANDB_DATA_ROOT, "wandb_runs.csv");
      const content = await readFile(csvPath, "utf8");
      
      const lines = content.split("\n").filter(Boolean);
      const runs = lines.slice(1).map(line => {
        // Simple regex to handle CSV with potential quotes
        const match = line.match(/^"?([^",]+)"?,"?([^",]+)"?/);
        if (match) {
          return { id: match[1], name: match[2] };
        }
        return null;
      }).filter(Boolean);

      return NextResponse.json({ runs });
    }
  } catch (error) {
    console.error("WandB API Error:", error);
    return NextResponse.json({ error: "Failed to fetch WandB data" }, { status: 500 });
  }
}
