export const routesConfig = [
  {
    path: "/",
    children: [
      {
        path: "dashboard",
        handle: { titleKey: "sidebar.dashboard" },
      },
      {
        path: "properties",
        handle: { titleKey: "sidebar.properties" },
      },
      {
        path: "properties/:id",
        handle: { titleKey: "propertyDetails.title" },
      },
      {
        path: "tenants",
        handle: { titleKey: "sidebar.tenants" },
      },
      {
        path: "tenants/:id",
        handle: { titleKey: "tenantDetails.title" },
      },
      {
        path: "finance",
        handle: { titleKey: "sidebar.finance" },
      },
      {
        path: "maintenance-inbox",
        handle: { titleKey: "sidebar.maintenanceInbox" },
      },
      {
        path: "maintenance-kpi",
        handle: { titleKey: "sidebar.maintenanceKpi" },
      },
      {
        path: "command-center",
        handle: { titleKey: "sidebar.commandCenter" },
      },
      {
        path: "attention-center",
        handle: { titleKey: "sidebar.attentionCenter" },
      },
      {
        path: "portfolio-health",
        handle: { titleKey: "sidebar.portfolioHealth" },
      },
      {
        path: "landlord-onboarding",
        handle: { titleKey: "sidebar.landlordOnboarding" },
      },
      {
        path: "invitations",
        handle: { titleKey: "sidebar.invitations" },
      },
      {
        path: "settings/profile",
        handle: { titleKey: "profile.title" },
      },
      {
        path: "settings/branding",
        handle: { titleKey: "sidebar.branding" },
      },
      {
        path: "settings/billing",
        handle: { titleKey: "sidebar.billing" },
      },
      {
        path: "settings/playbooks",
        handle: { titleKey: "sidebar.playbooks" },
      },
    ],
  },
];
