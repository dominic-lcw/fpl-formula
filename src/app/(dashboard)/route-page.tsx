import type { Metadata } from "next";
import { viewMeta, type DashboardView } from "@/lib/dashboard-nav";

export function metadataFor(view: DashboardView): Metadata {
  return {
    title: viewMeta[view].title,
    description: viewMeta[view].description,
  };
}

export default function DashboardRoutePage() {
  return null;
}
