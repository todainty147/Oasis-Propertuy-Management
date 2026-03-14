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
        path: "settings/branding",
        handle: { titleKey: "sidebar.branding" },
      },
    ],
  },
];
