export type TrustedOriginResult = {
  origin: string | null;
  error: string | null;
  trustedOrigins: string[];
};

type TrustedOriginConfig = {
  appUrl?: string | null;
  allowedOrigins?: string | null;
};

export function normalizeTrustedOrigin(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export function parseAllowedOrigins(value: string | null | undefined) {
  return String(value || "")
    .split(/[,\n]/)
    .map((origin) => normalizeTrustedOrigin(origin))
    .filter((origin): origin is string => Boolean(origin));
}

export function resolveTrustedAppOrigin({
  appUrl,
  allowedOrigins,
}: TrustedOriginConfig): TrustedOriginResult {
  const appOrigin = normalizeTrustedOrigin(appUrl);
  const trustedOrigins = Array.from(
    new Set([
      appOrigin,
      ...parseAllowedOrigins(allowedOrigins),
    ].filter((origin): origin is string => Boolean(origin))),
  );

  if (trustedOrigins.length === 0) {
    return {
      origin: null,
      error: "trusted_app_origin_not_configured",
      trustedOrigins: [],
    };
  }

  return {
    origin: appOrigin || trustedOrigins[0],
    error: null,
    trustedOrigins,
  };
}
