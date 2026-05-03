import Breadcrumbs from "./Breadcrumbs";
import { useI18n } from "../context/I18nContext";

export default function DashboardBreadcrumbs({ items = [] }) {
  const { t } = useI18n();

  return (
    <Breadcrumbs
      items={[
        { label: t("sidebar.dashboard"), to: "/dashboard" },
        ...items,
      ]}
    />
  );
}
