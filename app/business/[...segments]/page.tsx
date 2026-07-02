import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  DashboardFeaturePlaceholder,
  getFeatureDefinition,
} from "@/features/dashboard/feature-placeholder";

interface PageProps {
  params: Promise<{ segments: string[] }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { segments } = await params;
  const feature = getFeatureDefinition("business", segments);

  return {
    title: feature?.title ?? "Not Found",
  };
}

export default async function BusinessFeaturePage({ params }: PageProps) {
  const { segments } = await params;
  const feature = getFeatureDefinition("business", segments);

  if (!feature) {
    notFound();
  }

  return <DashboardFeaturePlaceholder feature={feature} />;
}
