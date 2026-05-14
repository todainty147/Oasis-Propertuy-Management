import { expect, test } from "@playwright/test";
import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import { logout, seededUsers, signInAs } from "./helpers/auth.js";

const MANAGER_ROLES = [
  { role: "owner", email: seededUsers.ownerA },
  { role: "admin", email: seededUsers.adminA },
  { role: "staff", email: seededUsers.staffA },
];

const ROLE_MATRIX = [
  {
    role: "owner",
    email: seededUsers.ownerA,
    landingUrl: /\/dashboard(?:\?.*)?$/,
    visibleNav: ["Dashboard", "Properties", "Tenants", "Finance", "Documents", "Maintenance Inbox", "Invitations", "Roles", "Custom fields"],
    hiddenNav: ["Contractor Portal", "My home"],
    directRoutes: {
      "/properties": /\/properties(?:\?.*)?$/,
      "/tenants": /\/tenants(?:\?.*)?$/,
      "/finance": /\/finance(?:\?.*)?$/,
      "/documents": /\/documents(?:\?.*)?$/,
      "/maintenance-inbox": /\/maintenance-inbox(?:\?.*)?$/,
    },
    actions: {
      tenants: ["Add tenant", "Invite tenant"],
      properties: [/Add property|Dodaj nieruchomość/i],
    },
  },
  {
    role: "admin",
    email: seededUsers.adminA,
    landingUrl: /\/dashboard(?:\?.*)?$/,
    visibleNav: ["Dashboard", "Properties", "Tenants", "Finance", "Documents", "Maintenance Inbox", "Invitations", "Roles", "Custom fields"],
    hiddenNav: ["Contractor Portal", "My home"],
    directRoutes: {
      "/properties": /\/properties(?:\?.*)?$/,
      "/tenants": /\/tenants(?:\?.*)?$/,
      "/finance": /\/finance(?:\?.*)?$/,
      "/documents": /\/documents(?:\?.*)?$/,
      "/maintenance-inbox": /\/maintenance-inbox(?:\?.*)?$/,
    },
    actions: {
      tenants: ["Add tenant", "Invite tenant"],
    },
  },
  {
    role: "staff",
    email: seededUsers.staffA,
    landingUrl: /\/dashboard(?:\?.*)?$/,
    visibleNav: ["Dashboard", "Properties", "Tenants", "Finance", "Documents", "Maintenance Inbox", "Invitations", "Roles", "Custom fields"],
    hiddenNav: ["Contractor Portal", "My home"],
    directRoutes: {
      "/properties": /\/properties(?:\?.*)?$/,
      "/tenants": /\/tenants(?:\?.*)?$/,
      "/finance": /\/finance(?:\?.*)?$/,
      "/documents": /\/documents(?:\?.*)?$/,
      "/maintenance-inbox": /\/maintenance-inbox(?:\?.*)?$/,
    },
    actions: {
      tenants: ["Add tenant", "Invite tenant"],
    },
  },
  {
    role: "tenant",
    email: seededUsers.tenantA1,
    landingUrl: /\/tenant\/home(?:\?.*)?$/,
    visibleNav: ["Overview", "My home", "Documents", "Payments", "Profile"],
    hiddenNav: ["Dashboard", "Properties", "Finance", "Tenants", "Maintenance Inbox", "Invitations", "Roles", "Custom fields", "Contractor Portal"],
    directRoutes: {
      "/properties": /\/tenant\/property(?:\?.*)?$/,
      "/tenants": /\/tenants(?:\?.*)?$/,
      "/finance": /\/finance(?:\?.*)?$/,
      "/documents": /\/tenant\/documents(?:\?.*)?$/,
      "/maintenance-inbox": /\/maintenance-inbox(?:\?.*)?$/,
    },
    actions: {
      tenantsHidden: ["Add tenant", "Invite tenant"],
      propertiesHidden: [/Add property|Dodaj nieruchomość/i],
    },
  },
  {
    role: "contractor",
    email: seededUsers.contractorA1,
    landingUrl: /\/contractor(?:\?.*)?$/,
    visibleNav: ["Contractor Portal"],
    hiddenNav: ["Dashboard", "Properties", "Tenants", "Finance", "Documents", "Maintenance Inbox", "Invitations", "Roles", "Custom fields", "My home"],
    directRoutes: {
      "/properties": /\/contractor(?:\?.*)?$/,
      "/tenants": /\/contractor(?:\?.*)?$/,
      "/finance": /\/contractor(?:\?.*)?$/,
      "/documents": /\/contractor(?:\?.*)?$/,
      "/maintenance-inbox": /\/maintenance-inbox(?:\?.*)?$/,
    },
    actions: {
      tenantsHidden: ["Add tenant", "Invite tenant"],
      propertiesHidden: [/Add property|Dodaj nieruchomość/i],
    },
  },
];

function navLinks(page, name) {
  // Exclude breadcrumb navs — DashboardBreadcrumbs injects a "Dashboard" link
  // into every page's breadcrumb, which would falsely match hidden-nav checks.
  return page.locator('nav:not([aria-label="Breadcrumb"])').getByRole("link", { name, exact: true });
}

async function expectVisibleNav(page, labels = []) {
  for (const label of labels) {
    await expect(navLinks(page, label).first(), `expected ${label} nav to be visible`).toBeVisible();
  }
}

async function expectHiddenNav(page, labels = []) {
  for (const label of labels) {
    await expect(navLinks(page, label), `expected ${label} nav to stay hidden`).toHaveCount(0);
  }
}

async function expectActionLabels(page, labels = []) {
  for (const label of labels) {
    await expect(page.getByRole("button", { name: label }).or(page.getByRole("link", { name: label }))).toBeVisible();
  }
}

async function expectHiddenActions(page, labels = []) {
  for (const label of labels) {
    await expect(page.getByRole("button", { name: label }).or(page.getByRole("link", { name: label }))).toHaveCount(0);
  }
}

async function expectActionPatterns(page, patterns = []) {
  for (const pattern of patterns) {
    await expect(page.getByRole("button", { name: pattern }).or(page.getByRole("link", { name: pattern }))).toBeVisible();
  }
}

async function expectHiddenActionPatterns(page, patterns = []) {
  for (const pattern of patterns) {
    await expect(page.getByRole("button", { name: pattern }).or(page.getByRole("link", { name: pattern }))).toHaveCount(0);
  }
}

test.describe("role navigation and permission matrix", () => {
  for (const row of ROLE_MATRIX) {
    test(`${row.role} sees only allowed navigation`, async ({ page }) => {
      await signInAs(page, row.email);
      await expect(page).toHaveURL(row.landingUrl);
      await expectVisibleNav(page, row.visibleNav);
      await expectHiddenNav(page, row.hiddenNav);
    });

    test(`${row.role} direct URL behavior matches role scope`, async ({ page }) => {
      await signInAs(page, row.email);

      for (const [path, expectedUrl] of Object.entries(row.directRoutes)) {
        await page.goto(path);
        await expect(page).toHaveURL(expectedUrl);
      }
    });

    test(`${row.role} action buttons match role permissions`, async ({ page }) => {
      await signInAs(page, row.email);

      await page.goto("/tenants");
      if (row.actions?.tenants?.length) {
        await expectActionLabels(page, row.actions.tenants);
      }
      if (row.actions?.tenantsHidden?.length) {
        await expectHiddenActions(page, row.actions.tenantsHidden);
      }

      await page.goto("/properties");
      if (row.actions?.properties?.length) {
        await expectActionPatterns(page, row.actions.properties);
      }
      if (row.actions?.propertiesHidden?.length) {
        await expectHiddenActionPatterns(page, row.actions.propertiesHidden);
      }
    });
  }

  for (const row of MANAGER_ROLES) {
    test(`${row.role} can read scoped landlord tenants and properties`, async ({ page }) => {
      await signInAs(page, row.email);

      const tenantScopeSwitchers = page.getByLabel("All tenants");
      if (await tenantScopeSwitchers.count()) {
        const tenantScopeSwitcher = tenantScopeSwitchers.last();
        await tenantScopeSwitcher.selectOption("");
        await expect(tenantScopeSwitcher).toContainText("Tenant A1");
      }

      await page.goto("/tenants");
      await page.getByRole("textbox", { name: /Search tenants/i }).fill("Tenant A1");
      await expect(page.getByRole("link", { name: "Tenant A1" })).toBeVisible();

      await page.goto("/properties");
      await expect(page.getByRole("link", { name: /11 Starlight Avenue/i })).toBeVisible();
    });
  }

  test("root support can switch accounts, read landlord data, and keeps root-only account switcher", async ({ page }) => {
    await signInAs(page, seededUsers.rootOwner);

    const accountSwitcher = page.getByLabel("Account").first();
    await expect(accountSwitcher).toBeVisible();
    await accountSwitcher.selectOption(isolationFixtures.accounts.accountA.id);

    await expectVisibleNav(page, ["Dashboard", "Properties", "Tenants", "Finance", "Documents", "Maintenance Inbox", "Invitations"]);
    await page.goto("/tenants");
    await page.getByRole("textbox", { name: /Search tenants/i }).fill("Tenant A1");
    await expect(page.getByRole("link", { name: "Tenant A1" })).toBeVisible();
    await expect(page.getByLabel("Account").first()).toBeVisible();
  });

  test("non-root roles never see the account switcher", async ({ page }) => {
    for (const row of ROLE_MATRIX) {
      await signInAs(page, row.email);
      await expect(page.getByLabel("Account")).toHaveCount(0);
      await logout(page);
    }
  });
});
