"use client";

import { useState } from "react";

const personaPanels = [
  {
    key: "landlords",
    label: "For Landlords",
    title: "Keep visibility and follow-up control",
    body:
      "See maintenance status, evidence trails, and the next approval or follow-up step without exposing the landlord workspace.",
    points: ["maintenance visibility", "evidence trail", "approval/follow-up control"],
  },
  {
    key: "tenants",
    label: "For Tenants",
    title: "Give tenants one clear place for their home",
    body:
      "Tenants can submit repairs, view status, open shared documents, and see rent/payment visibility where it is available.",
    points: ["submit repair", "view status", "shared documents", "rent/payment visibility"],
  },
  {
    key: "contractors",
    label: "For Contractors",
    title: "Hand off assigned jobs cleanly",
    body:
      "Contractors see assigned jobs and can provide quote, status, evidence, photo, or invoice updates where applicable.",
    points: ["assigned jobs", "quote/status updates", "evidence/photos/invoices"],
  },
];

export function TenantPortalPersonaToggle() {
  const [activeKey, setActiveKey] = useState(personaPanels[0].key);
  const activePanel = personaPanels.find((panel) => panel.key === activeKey) || personaPanels[0];

  return (
    <section className="section tenant-personas" data-marketing-section="tenant-portal-personas">
      <div className="container">
        <div className="section-title">
          <span className="eyebrow">Portal handoff</span>
          <h2>One workflow, three correctly scoped views</h2>
          <p className="muted">
            The tenant portal works best when each person sees enough to move the work forward,
            and nothing that belongs to another role.
          </p>
        </div>

        <div className="card tenant-personas__panel">
          <div className="tenant-personas__tabs" role="tablist" aria-label="Tenant portal persona views">
            {personaPanels.map((panel) => (
              <button
                key={panel.key}
                type="button"
                role="tab"
                aria-selected={panel.key === activePanel.key}
                className={panel.key === activePanel.key ? "is-active" : ""}
                onClick={() => setActiveKey(panel.key)}
              >
                {panel.label}
              </button>
            ))}
          </div>

          <div className="tenant-personas__content">
            <div>
              <h3>{activePanel.title}</h3>
              <p>{activePanel.body}</p>
            </div>
            <ul>
              {activePanel.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
