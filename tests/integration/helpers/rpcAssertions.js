import { expect } from "vitest";

export function expectAccessDenied(result) {
  // Accept either: (a) an error with an access-denied message, or
  // (b) no error but an empty/null result (silent RLS filtering).
  if (result.error) {
    const message = String(result.error.message || "").toLowerCase();
    expect(
      message.includes("access denied") ||
        message.includes("unauthorized account access"),
    ).toBe(true);
  } else {
    const rows = Array.isArray(result.data) ? result.data : (result.data != null ? [result.data] : []);
    expect(rows).toHaveLength(0);
  }
}

export function firstRow(data) {
  return Array.isArray(data) ? data[0] : data;
}
