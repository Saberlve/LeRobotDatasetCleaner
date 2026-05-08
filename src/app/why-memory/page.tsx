import React from "react";
import { StoryPage } from "@/components/thesis/story-page";
import { ThesisSiteShell } from "@/components/thesis/site-shell";
import { getStoryPage } from "@/content/thesis-site";

export default function WhyMemoryPage() {
  const page = getStoryPage("/why-memory");

  if (!page) {
    throw new Error("Missing story page content for /why-memory");
  }

  return (
    <ThesisSiteShell>
      <StoryPage page={page} />
    </ThesisSiteShell>
  );
}
