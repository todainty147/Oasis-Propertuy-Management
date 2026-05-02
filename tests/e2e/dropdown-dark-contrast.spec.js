import { expect, test } from "@playwright/test";
import { seededUsers, signInAs } from "./helpers/auth.js";

async function forceDarkMode(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("oasis_lang", "en");
    window.localStorage.setItem("oasis_theme_pref", "dark");
  });
}

function parseRgb(value) {
  const match = String(value || "").match(/rgba?\(([^)]+)\)/i);
  if (!match) return null;
  const parts = match[1].split(",").map((part) => Number.parseFloat(part.trim()));
  if (parts.length < 3 || parts.some((part, index) => index < 3 && Number.isNaN(part))) return null;
  return parts.slice(0, 3);
}

function relativeLuminance([r, g, b]) {
  return [r, g, b]
    .map((channel) => {
      const value = channel / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    })
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
}

function contrastRatio(foreground, background) {
  const fg = parseRgb(foreground);
  const bg = parseRgb(background);
  if (!fg || !bg) return 0;
  const lighter = Math.max(relativeLuminance(fg), relativeLuminance(bg));
  const darker = Math.min(relativeLuminance(fg), relativeLuminance(bg));
  return (lighter + 0.05) / (darker + 0.05);
}

async function expectDropdownContrast(page, contextLabel) {
  await expect(page.locator("html.dark")).toHaveCount(1);

  const rows = await page.locator("select").evaluateAll((selects) =>
    selects
      .filter((select) => select.getClientRects().length > 0)
      .map((select) => {
        const selectStyle = window.getComputedStyle(select);
        const option = select.querySelector("option");
        const optionStyle = option ? window.getComputedStyle(option) : null;

        return {
          label: select.getAttribute("aria-label") || select.name || select.id || select.textContent?.trim()?.slice(0, 40) || "select",
          selectColor: selectStyle.color,
          selectBackground: selectStyle.backgroundColor,
          optionColor: optionStyle?.color || "",
          optionBackground: optionStyle?.backgroundColor || "",
        };
      })
  );

  expect(rows.length, `${contextLabel} should expose at least one dropdown`).toBeGreaterThan(0);

  for (const row of rows) {
    expect(
      contrastRatio(row.selectColor, row.selectBackground),
      `${contextLabel} dropdown "${row.label}" selected value contrast`
    ).toBeGreaterThanOrEqual(4.5);

    if (row.optionColor && row.optionBackground && row.optionBackground !== "rgba(0, 0, 0, 0)") {
      expect(
        contrastRatio(row.optionColor, row.optionBackground),
        `${contextLabel} dropdown "${row.label}" option contrast`
      ).toBeGreaterThanOrEqual(4.5);
    }
  }
}

[
  ["landlord owner", seededUsers.ownerA],
  ["staff", seededUsers.staffA],
  ["tenant", seededUsers.tenantA1],
  ["contractor", seededUsers.contractorA1],
].forEach(([contextLabel, email]) => {
  test(`dark mode dropdowns have readable contrast for ${contextLabel}`, async ({ page }) => {
    await forceDarkMode(page);
    await signInAs(page, email);
    await expectDropdownContrast(page, contextLabel);
  });
});
