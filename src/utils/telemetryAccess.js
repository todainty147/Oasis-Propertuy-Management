function normalizeRole(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeSupportRoles(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[,\s]+/)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
  }
  return [];
}

function hasSupportTelemetryFlag(user) {
  const appRoles = normalizeSupportRoles(user?.app_metadata?.oasis_support_roles);
  const userRoles = normalizeSupportRoles(user?.user_metadata?.oasis_support_roles);
  const combinedRoles = new Set([...appRoles, ...userRoles]);

  if (combinedRoles.has("telemetry") || combinedRoles.has("root_telemetry")) {
    return true;
  }

  return Boolean(
    user?.app_metadata?.support_operator === true ||
      user?.app_metadata?.root_telemetry_access === true ||
      user?.user_metadata?.support_operator === true ||
      user?.user_metadata?.root_telemetry_access === true,
  );
}

export function getRootTelemetryAccessMode({ isRootOperator = false, activeRole = null, user = null } = {}) {
  if (isRootOperator) return "root";

  const role = normalizeRole(activeRole);
  if (["owner", "admin", "staff", "tenant", "contractor"].includes(role)) {
    return "denied";
  }

  return hasSupportTelemetryFlag(user) ? "support" : "denied";
}

export function canAccessRootTelemetry(options = {}) {
  return getRootTelemetryAccessMode(options) !== "denied";
}
