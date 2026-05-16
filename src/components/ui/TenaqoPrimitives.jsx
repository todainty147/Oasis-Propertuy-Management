import { forwardRef } from "react";

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

export function PageShell({
  children,
  className = "",
  maxWidth = "7xl",
  density = "default",
}) {
  const maxWidthClass = {
    "5xl": "max-w-5xl",
    "6xl": "max-w-6xl",
    "7xl": "max-w-7xl",
    full: "max-w-none",
  }[maxWidth] || maxWidth;

  return (
    <div
      className={cx(
        "tenaqo-page-shell",
        density === "compact" && "tenaqo-page-shell--compact",
        maxWidthClass,
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
  meta,
  className = "",
}) {
  return (
    <header className={cx("tenaqo-page-header", className)}>
      <div className="min-w-0 space-y-2">
        {eyebrow ? <p className="tenaqo-page-header__eyebrow">{eyebrow}</p> : null}
        <div>
          <h1 className="tenaqo-page-header__title">{title}</h1>
          {subtitle ? <p className="tenaqo-page-header__subtitle mt-2">{subtitle}</p> : null}
        </div>
        {meta ? <div className="flex flex-wrap gap-2">{meta}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function PageHeroPanel({ children, className = "" }) {
  return <section className={cx("tenaqo-hero-panel", className)}>{children}</section>;
}

export const TenaqoCard = forwardRef(function TenaqoCard(
  { children, className = "", variant = "default", as: Component = "div", ...props },
  ref,
) {
  return (
    <Component
      ref={ref}
      {...props}
      className={cx(
        "tenaqo-card",
        variant !== "default" && `tenaqo-card--${variant}`,
        className,
      )}
    >
      {children}
    </Component>
  );
});

export function MetricTile({
  label,
  value,
  context,
  trend,
  icon: Icon,
  status = "neutral",
  action,
  className = "",
}) {
  const statusClass = {
    success: "text-emerald-600 dark:text-emerald-300",
    warning: "text-amber-600 dark:text-amber-300",
    danger: "text-rose-600 dark:text-rose-300",
    info: "text-sky-600 dark:text-sky-300",
    neutral: "text-[var(--text-primary)]",
  }[status] || "text-[var(--text-primary)]";

  return (
    <div className={cx("tenaqo-metric-tile", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--text-muted)]">{label}</p>
          <p className={cx("mt-1 text-2xl font-semibold tracking-normal", statusClass)}>{value}</p>
        </div>
        {Icon ? (
          <span className="tenaqo-icon-tile" aria-hidden="true">
            <Icon size={18} />
          </span>
        ) : null}
      </div>
      <div className="space-y-1">
        {context ? <p className="text-sm text-[var(--text-muted)]">{context}</p> : null}
        {trend ? <p className="text-xs font-medium text-[var(--text-secondary)]">{trend}</p> : null}
        {action ? <div>{action}</div> : null}
      </div>
    </div>
  );
}

export function StatusPill({ children, variant = "neutral", className = "" }) {
  return (
    <span className={cx("tenaqo-status-pill", `tenaqo-status-pill--${variant}`, className)}>
      {children}
    </span>
  );
}

export function ActionPill({
  children,
  className = "",
  active = false,
  as: Component = "button",
  type = "button",
  ...props
}) {
  const componentProps = Component === "button" ? { type } : {};
  return (
    <Component
      {...componentProps}
      {...props}
      aria-pressed={Component === "button" ? active : undefined}
      className={cx("tenaqo-action-pill", className)}
    >
      {children}
    </Component>
  );
}

export function SectionHeader({
  title,
  subtitle,
  eyebrow,
  action,
  className = "",
}) {
  return (
    <div className={cx("tenaqo-section-header", className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="tenaqo-section-header__eyebrow">{eyebrow}</p> : null}
        <h2 className="tenaqo-section-header__title">{title}</h2>
        {subtitle ? <p className="tenaqo-section-header__subtitle">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function OperationalList({ children, className = "" }) {
  return <div className={cx("tenaqo-operational-list", className)}>{children}</div>;
}

export function OperationalListItem({
  children,
  className = "",
  as: Component = "button",
  type = "button",
  ...props
}) {
  const componentProps = Component === "button" ? { type } : {};
  return (
    <Component
      {...componentProps}
      {...props}
      className={cx("tenaqo-operational-list__item", className)}
    >
      {children}
    </Component>
  );
}

export function EmptyState({ title, body, action, className = "" }) {
  return (
    <div className={cx("tenaqo-empty-state", className)}>
      {title ? <p className="font-semibold text-[var(--text-primary)]">{title}</p> : null}
      {body ? <p className={title ? "mt-1" : ""}>{body}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
