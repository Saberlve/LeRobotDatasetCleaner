import React from "react";
import { StoryPage } from "@/components/thesis/story-page";
import { ThesisSiteShell } from "@/components/thesis/site-shell";
import { getStoryPage } from "@/content/thesis-site";

export default function DatasetAndToolingPage() {
  const page = getStoryPage("/dataset-and-tooling");

  if (!page) {
    throw new Error("Missing story page content for /dataset-and-tooling");
  }

  return (
    <ThesisSiteShell>
      <StoryPage page={page} />
    </ThesisSiteShell>
  );
}
