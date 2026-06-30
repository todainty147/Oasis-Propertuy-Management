export {
  COMPLIANCE_SAFE_STATUSES,
  COMPLIANCE_SAFE_STATUS_LABELS,
  calculateComplianceRating,
  deriveComplianceItemStatus,
  deriveComplianceItemStatus as deriveComplianceSafeStatus,
  deriveComplianceServiceStatus,
  getComplianceSummary,
  isExpiringSoon,
  normalizeComplianceStatus,
} from "../lib/complianceSafeStatus";

export function groupComplianceItemsByTenancy(items = []) {
  return items.reduce((groups, item) => {
    const key = item.tenancy_id || item.tenant_id || "unassigned";
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
    return groups;
  }, {});
}
