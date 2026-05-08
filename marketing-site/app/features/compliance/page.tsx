import type { Metadata } from "next";

import { BenefitGrid } from "../../../components/marketing/benefit-grid";
import { ContentSection } from "../../../components/marketing/content-section";
import { FinalCta } from "../../../components/marketing/final-cta";
import { PageHero } from "../../../components/marketing/page-hero";
import { complianceContent } from "../../../content/features/compliance";
import { buildMetadata } from "../../../lib/metadata";

export const metadata: Metadata = buildMetadata(complianceContent.seo);

export default function CompliancePage() {
  const c = complianceContent;
  return (
    <>
      <PageHero {...c.hero} />

      <ContentSection {...c.problemSection} />

      {/* Lease Auditor */}
      <ContentSection
        eyebrow={c.leaseAuditorSection.eyebrow}
        title={c.leaseAuditorSection.title}
        body={c.leaseAuditorSection.body}
        items={c.leaseAuditorSection.items}
        imageSrc={c.leaseAuditorSection.imageSrc}
        imageAlt={c.leaseAuditorSection.imageAlt}
        imageAlign={c.leaseAuditorSection.imageAlign}
      />
      <div className="container">
        <p className="legal-note muted" style={{ fontSize: "0.8rem", marginTop: "-1rem", marginBottom: "2rem", opacity: 0.7 }}>
          {c.leaseAuditorSection.disclaimer}
        </p>
      </div>

      {/* Rent Shield */}
      <ContentSection
        eyebrow={c.rentShieldSection.eyebrow}
        title={c.rentShieldSection.title}
        body={c.rentShieldSection.body}
        items={c.rentShieldSection.items}
        imageSrc={c.rentShieldSection.imageSrc}
        imageAlt={c.rentShieldSection.imageAlt}
        imageAlign={c.rentShieldSection.imageAlign}
      />
      <div className="container">
        <p className="legal-note muted" style={{ fontSize: "0.8rem", marginTop: "-1rem", marginBottom: "2rem", opacity: 0.7 }}>
          {c.rentShieldSection.disclaimer}
        </p>
      </div>

      {/* Tax Readiness */}
      <ContentSection
        eyebrow={c.taxSection.eyebrow}
        title={c.taxSection.title}
        body={c.taxSection.body}
        items={c.taxSection.items}
        imageSrc={c.taxSection.imageSrc}
        imageAlt={c.taxSection.imageAlt}
        imageAlign={c.taxSection.imageAlign}
      />
      <div className="container">
        <p className="legal-note muted" style={{ fontSize: "0.8rem", marginTop: "-1rem", marginBottom: "2rem", opacity: 0.7 }}>
          {c.taxSection.disclaimer}
        </p>
      </div>

      <ContentSection {...c.connectedSection} />

      <BenefitGrid {...c.benefits} />

      <FinalCta {...c.finalCta} />
    </>
  );
}
