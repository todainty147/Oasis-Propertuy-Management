import { expect } from "vitest";

export function expectAccessDenied(result) {
  expect(result.data ?? null).toBeNull();
  const message = String(result.error?.message || "").toLowerCase();
  expect(
    message.includes("access denied") ||
      message.includes("unauthorized account access"),
  ).toBe(true);
}

export function firstRow(data) {
  return Array.isArray(data) ? data[0] : data;
}
