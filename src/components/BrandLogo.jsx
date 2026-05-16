import { BRAND } from "../config/brand";

const LOGO_ICON_SRC = "/brand/tenaqo/logo-icon-transparent.png";

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

export default function BrandLogo({
  variant = "sidebar",
  showSubtitle = true,
  compact = false,
  className = "",
  useTile,
  accountBranding = null,
}) {
  const resolvedUseTile = useTile ?? (variant === "sidebar" || variant === "header" || variant === "icon");
  const iconOnly = variant === "icon";
  const accountLogo = accountBranding?.logo_url || accountBranding?.logoUrl || "";
  const accountName = accountBranding?.brand_name || accountBranding?.brandName || "";
  const displayName = accountName || BRAND.name;
  const subtitle = accountName ? "" : BRAND.tagline;
  const shouldShowText = !iconOnly && (!compact || variant !== "sidebar");
  const shouldShowSubtitle = shouldShowText && showSubtitle && !compact && Boolean(subtitle);
  const accessibleLabel = shouldShowSubtitle ? `${displayName} ${subtitle}` : displayName;
  const iconSrc = accountLogo || LOGO_ICON_SRC;

  return (
    <div
      className={cx(
        "brand-logo",
        `brand-logo--${variant}`,
        compact && "brand-logo--compact",
        iconOnly && "brand-logo--icon-only",
        className,
      )}
      aria-label={accessibleLabel}
    >
      <span className={cx("brand-logo__tile", resolvedUseTile && "brand-logo__tile--framed")}>
        <img
          src={iconSrc}
          alt=""
          className="brand-logo__image"
          decoding="async"
        />
      </span>

      {shouldShowText ? (
        <span className="brand-logo__copy" aria-hidden="true">
          <span className="brand-logo__wordmark">{displayName}</span>
          {shouldShowSubtitle ? (
            <span className="brand-logo__subtitle">{subtitle}</span>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}
