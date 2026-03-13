import { useTenant } from "../context/TenantContext";
import { useTenants } from "../hooks/useTenants";
import { useAccount } from "../context/AccountContext";
import { useI18n } from "../context/I18nContext";

export default function TenantSwitcher() {
  const { activeAccountId } = useAccount();
  const { activeTenantId, setActiveTenantId, clearTenant } = useTenant();
  const { t } = useI18n();

  const { tenants, loading } = useTenants({
    enabled: !!activeAccountId,
  });

  if (loading || tenants.length === 0) return null;

  return (
    <select
      value={activeTenantId ?? ""}
      onChange={(e) =>
        e.target.value
          ? setActiveTenantId(e.target.value)
          : clearTenant()
      }
      className="border rounded-lg px-3 py-2 text-sm bg-white"
    >
      <option value="">{t("tenant.allTenants")}</option>
      {tenants.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}
