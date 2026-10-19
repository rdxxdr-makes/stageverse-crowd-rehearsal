import { createFileRoute } from "@tanstack/react-router";
import { StageVerse } from "@/components/stage/StageVerse";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "StageVerse — 3D Virtual Audience for Stage Practice" },
      { name: "description", content: "Rehearse in front of a live 3D audience of supporters, critics and neutral listeners." },
      { property: "og:title", content: "StageVerse — 3D Virtual Audience" },
      { property: "og:description", content: "Practice stage performance in front of a reactive 3D crowd." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StageVerse,
});
