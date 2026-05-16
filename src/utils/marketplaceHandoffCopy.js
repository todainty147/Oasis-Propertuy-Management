function line(label, value) {
  const next = String(value || "").trim();
  return `${label}: ${next || "—"}`;
}

export function buildMarketplaceHandoffCopy(job, { locale = "en" } = {}) {
  const lang = String(locale || "en").toLowerCase();
  const isPolish = lang === "pl";
  const isGerman = lang === "de";

  const labels = isPolish
    ? {
        title: "Tytuł zlecenia",
        area: "Lokalizacja",
        issue: "Opis problemu",
        urgency: "Pilność",
        contact: "Kontakt",
        access: "Uwagi dotyczące dostępu",
        attachments: "Załączniki",
        reference: "Referencja Tenaqo",
        none: "Brak",
      }
    : isGerman
      ? {
          title: "Auftragstitel",
          area: "Ort / Bereich",
          issue: "Problembeschreibung",
          urgency: "Dringlichkeit",
          contact: "Kontakt",
          access: "Hinweise zum Zugang",
          attachments: "Anhänge",
          reference: "Tenaqo-Referenz",
          none: "Keine",
        }
      : {
          title: "Job title",
          area: "Property area",
          issue: "Issue description",
          urgency: "Urgency",
          contact: "Preferred contact",
          access: "Access notes",
          attachments: "Attachments",
          reference: "Tenaqo internal reference",
          none: "None",
        };

  const areaParts = [job.propertyLabel, job.city, job.postcode].filter(Boolean);
  const contactParts = [];
  if (job.consentConfirmedAt) {
    if (job.contactName) contactParts.push(job.contactName);
    if (job.contactEmail) contactParts.push(job.contactEmail);
    if (job.contactPhone) contactParts.push(job.contactPhone);
  }

  const accessNotes = job.metadata?.accessNotes || job.accessNotes || labels.none;
  const attachmentsNote = job.metadata?.attachmentsNote || job.attachmentsNote || labels.none;

  return [
    line(labels.title, job.title),
    line(labels.area, areaParts.join(", ")),
    "",
    line(labels.issue, job.description),
    line(labels.urgency, job.urgency),
    line(labels.contact, contactParts.join(" • ") || labels.none),
    line(labels.access, accessNotes),
    line(labels.attachments, attachmentsNote),
    line(labels.reference, job.workOrderId || job.id),
  ].join("\n");
}
