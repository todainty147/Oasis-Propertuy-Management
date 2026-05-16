import { describe, expect, it } from "vitest";

import { normalizeWorkOrderStatus, WORK_ORDER_STATUS } from "../../src/utils/statuses";

describe("status helpers", () => {
  it("normalizes work-order statuses across supported labels", () => {
    expect(normalizeWorkOrderStatus("assigned")).toBe(WORK_ORDER_STATUS.ASSIGNED);
    expect(normalizeWorkOrderStatus("Przypisane")).toBe(WORK_ORDER_STATUS.ASSIGNED);
    expect(normalizeWorkOrderStatus("in progress")).toBe(WORK_ORDER_STATUS.IN_PROGRESS);
    expect(normalizeWorkOrderStatus("w trakcie")).toBe(WORK_ORDER_STATUS.IN_PROGRESS);
    expect(normalizeWorkOrderStatus("zakończone")).toBe(WORK_ORDER_STATUS.COMPLETED);
    expect(normalizeWorkOrderStatus("anulowane")).toBe(WORK_ORDER_STATUS.CANCELLED);
    expect(normalizeWorkOrderStatus("zablokowane")).toBe(WORK_ORDER_STATUS.BLOCKED);
  });
});
