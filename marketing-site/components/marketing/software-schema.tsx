export function SoftwareSchema() {
  const data = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "OASIS Rental",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: "https://oasisrental.com",
    description:
      "Property management software for landlords to stay on top of tenants, maintenance, rent, records, and portfolio follow-up.",
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
