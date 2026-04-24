import type { Metadata } from "next";

import { BenefitGrid } from "../../../components/marketing/benefit-grid";
import { ContentSection } from "../../../components/marketing/content-section";
import { FinalCta } from "../../../components/marketing/final-cta";
import { PageHero } from "../../../components/marketing/page-hero";
import { securityAuditContent } from "../../../content/features/security-audit";
import { buildMetadata } from "../../../lib/metadata";

export const metadata: Metadata = buildMetadata(securityAuditContent.seo);

export default function SecurityAuditPage() {
  return (
    <>
      <PageHero {...securityAuditContent.hero} />
      <ContentSection {...securityAuditContent.problemSection} />
      <ContentSection {...securityAuditContent.solutionSection} />
      <BenefitGrid {...securityAuditContent.benefits} />
      <FinalCta {...securityAuditContent.finalCta} />
    </>
  );
}
