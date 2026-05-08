import React from "react";
import { LandingPage } from "@/components/thesis/landing-page";
import { ThesisSiteShell } from "@/components/thesis/site-shell";

export default function Home() {
  return (
    <ThesisSiteShell>
      <LandingPage />
    </ThesisSiteShell>
  );
}
