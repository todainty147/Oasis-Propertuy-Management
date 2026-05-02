import type { Metadata } from "next";

import { BenefitGrid } from "../../../components/marketing/benefit-grid";
import { ContentSection } from "../../../components/marketing/content-section";
import { FinalCta } from "../../../components/marketing/final-cta";
import { PageHero } from "../../../components/marketing/page-hero";
import { maintenanceManagementContent } from "../../../content/features/maintenance-management";
import { buildMetadata } from "../../../lib/metadata";

export const metadata: Metadata = buildMetadata(maintenanceManagementContent.seo);

export default function MaintenanceManagementPage() {
  return (
    <>
      <PageHero {...maintenanceManagementContent.hero} />
      <ContentSection {...maintenanceManagementContent.painPoints} />
      <ContentSection {...maintenanceManagementContent.solution} />
      <ContentSection {...maintenanceManagementContent.workflowLoop} />
      <BenefitGrid {...maintenanceManagementContent.benefits} />
      <FinalCta {...maintenanceManagementContent.finalCta} />
    </>
  );
}
