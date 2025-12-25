export const routesConfig = [
  {
    path: "/",
    children: [
      {
        path: "dashboard",
        handle: { title: "Pulpit" },
      },
      {
        path: "properties",
        handle: { title: "Nieruchomości" },
      },
      {
        path: "properties/:id",
        handle: { title: "Szczegóły nieruchomości" },
      },
      {
        path: "tenants",
        handle: { title: "Najemcy" },
      },
      {
        path: "tenants/:id",
        handle: { title: "Szczegóły najemcy" },
      },
      {
        path: "finance",
        handle: { title: "Finanse" },
      },
    ],
  },
];
