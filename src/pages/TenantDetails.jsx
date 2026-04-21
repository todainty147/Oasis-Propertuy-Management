import { useParams, useNavigate, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import Card from "../components/Card";
import Badge from "../components/Badge";
import DashboardBreadcrumbs from "../components/DashboardBreadcrumbs";
import Skeleton from "../components/ui/Skeleton";
import { usePageTitle } from "../layout/PageTitleContext";
import TenantDocumentsSection from "../components/TenantDocumentsSection";
import LeaseSummaryCard from "../components/LeaseSummaryCard";
import TenantTimelineCard from "../components/TenantTimelineCard";
import CustomFieldsReadOnlySection from "../components/CustomFieldsReadOnlySection";
import CustomFieldsFormSection from "../components/CustomFieldsFormSection";
import { useAccount } from "../context/AccountContext";
import { useI18n } from "../context/I18nContext";
import { isManageRole } from "../utils/permissions";
import { can } from "../utils/permissions";
import {
  listEntityCustomFieldEditorState,
  listEntityCustomFieldValues,
  saveEntityCustomFieldValues,
  validateCustomFieldEntries,
  validateCustomFieldInput,
} from "../services/customFieldService";
import { updateTenant } from "../services/tenantService";

/* ======================
   SKELETON
   ====================== */

function TenantDetailsSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-4 w-56" />
      <Card className="p-6 space-y-6">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-32" />
      </Card>
    </div>
  );
}

/* ======================
   TENANT DETAILS
   ====================== */

export default function TenantDetails({
  loading = false,
  tenants = [],
  properties = [],
  payments = [],
}) {
  /* ---------- ROUTER ---------- */
  const { id } = useParams();
  const navigate = useNavigate();

  /* ---------- ACCOUNT ---------- */
  const { accountLoading, activeAccountId, activeRole, activePermissionContext } = useAccount();
  const { t } = useI18n();
  const canManageLease = isManageRole(activeRole);
  const canUpdateTenant = can(activePermissionContext, "tenants", "update");
  const [customFieldRows, setCustomFieldRows] = useState([]);
  const [customFieldsLoading, setCustomFieldsLoading] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", email: "", phone: "", propertyId: "" });
  const [editCustomFieldDefinitions, setEditCustomFieldDefinitions] = useState([]);
  const [editCustomFieldValues, setEditCustomFieldValues] = useState({});
  const [editCustomFieldErrors, setEditCustomFieldErrors] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);

  /* ---------- PAGE TITLE ---------- */
  const { setTitle } = usePageTitle();

  /* ---------- DATA LOOKUPS ---------- */
  const tenant = tenants.find((t) => String(t.id) === String(id));
  const property = properties.find(
    (p) => String(p.id) === String(tenant?.propertyId)
  );

  /* ---------- EFFECTS ---------- */
  useEffect(() => {
    if (tenant?.name) {
      setTitle(tenant.name);
    }
  }, [tenant?.name, setTitle]);

  useEffect(() => {
    let cancelled = false;

    async function loadCustomFields() {
      if (!activeAccountId || !tenant?.id) {
        if (!cancelled) setCustomFieldRows([]);
        return;
      }

      setCustomFieldsLoading(true);
      try {
        const rows = await listEntityCustomFieldValues({
          accountId: activeAccountId,
          entityType: "tenant",
          entityId: tenant.id,
        });
        if (!cancelled) setCustomFieldRows(rows);
      } catch {
        if (!cancelled) setCustomFieldRows([]);
      } finally {
        if (!cancelled) setCustomFieldsLoading(false);
      }
    }

    loadCustomFields();
    return () => {
      cancelled = true;
    };
  }, [activeAccountId, tenant?.id]);

  useEffect(() => {
    if (!tenant) return;
    setEditForm({
      name: tenant.name ?? "",
      email: tenant.email ?? "",
      phone: tenant.phone ?? "",
      propertyId: tenant.propertyId ?? "",
    });
  }, [tenant]);

  useEffect(() => {
    let cancelled = false;

    async function loadCustomFieldEditorState() {
      if (!activeAccountId || !tenant?.id || !canUpdateTenant) {
        if (!cancelled) {
          setEditCustomFieldDefinitions([]);
          setEditCustomFieldValues({});
        }
        return;
      }

      try {
        const state = await listEntityCustomFieldEditorState({
          accountId: activeAccountId,
          entityType: "tenant",
          entityId: tenant.id,
        });
        if (!cancelled) {
          setEditCustomFieldDefinitions(state.definitions);
          setEditCustomFieldValues(state.values);
          setEditCustomFieldErrors({});
        }
      } catch {
        if (!cancelled) {
          setEditCustomFieldDefinitions([]);
          setEditCustomFieldValues({});
          setEditCustomFieldErrors({});
        }
      }
    }

    loadCustomFieldEditorState();
    return () => {
      cancelled = true;
    };
  }, [activeAccountId, canUpdateTenant, tenant?.id]);

  /* ---------- EARLY STATES ---------- */
  if (loading || accountLoading) {
    return <TenantDetailsSkeleton />;
  }

  if (!canManageLease) {
    return <Navigate to="/dashboard" replace />;
  }

  if (!tenant) {
    return (
      <div className="p-6 bg-white rounded-xl border">
        <p>{t("tenantDetails.notFound")}</p>
        <button
          className="mt-4 text-blue-600"
          onClick={() => navigate("/tenants")}
        >
          {t("common.back")}
        </button>
      </div>
    );
  }

  async function refreshCustomFields() {
    if (!activeAccountId || !tenant?.id) return;
    setCustomFieldsLoading(true);
    try {
      const rows = await listEntityCustomFieldValues({
        accountId: activeAccountId,
        entityType: "tenant",
        entityId: tenant.id,
      });
      setCustomFieldRows(rows);
    } catch {
      setCustomFieldRows([]);
    } finally {
      setCustomFieldsLoading(false);
    }
  }

  async function handleSaveTenantDetails(event) {
    event.preventDefault();
    if (!tenant?.id || !activeAccountId) return;
    const validation = validateCustomFieldEntries(editCustomFieldDefinitions, editCustomFieldValues);
    if (!validation.isValid) {
      setEditCustomFieldErrors(validation.errors);
      return;
    }
    setSavingEdit(true);
    try {
      await updateTenant(tenant.id, {
        name: editForm.name,
        email: editForm.email,
        phone: editForm.phone,
        propertyId: editForm.propertyId || null,
      });
      await saveEntityCustomFieldValues({
        accountId: activeAccountId,
        entityId: tenant.id,
        definitions: editCustomFieldDefinitions,
        values: validation.normalizedValues,
      });
      await refreshCustomFields();
      window.alert("Tenant details saved.");
    } catch (error) {
      window.alert(error?.message || "Failed to save tenant details");
    } finally {
      setSavingEdit(false);
    }
  }

  function handleEditCustomFieldChange(definition, value) {
    const definitionId = String(definition?.id || "");
    const validation = validateCustomFieldInput(definition, value);
    setEditCustomFieldValues((current) => ({
      ...current,
      [definitionId]: value,
    }));
    setEditCustomFieldErrors((current) => ({
      ...current,
      [definitionId]: validation.error || "",
    }));
  }

  /* ---------- PAYMENTS ---------- */
  const tenantPayments = payments.filter(
    (p) => String(p.tenantId) === String(tenant.id)
  );

  const paidCount = tenantPayments.filter(
    (p) => p.status === "Opłacone"
  ).length;

  const overdueCount = tenantPayments.filter(
    (p) => p.status === "Zaległe"
  ).length;

  /* ---------- TENANT STATUS ---------- */
  let tenantStatus = t("payments.status.overdue");
  if (overdueCount === 0 && paidCount > 0) tenantStatus = t("payments.status.paid");
  else if (paidCount > 0 && overdueCount > 0) tenantStatus = t("payments.status.partial");

  /* ======================
     RENDER
     ====================== */

  return (
    <div className="space-y-6">
      <DashboardBreadcrumbs
        items={[
          { label: t("sidebar.tenants"), to: "/tenants" },
          { label: tenant.name },
        ]}
      />

      {/* ---------- TENANT CARD ---------- */}
      <Card className="p-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              {tenant.name}
            </h2>
            <p className="text-slate-600 mt-1">{tenant.email}</p>
            <p className="text-slate-600">{tenant.phone}</p>
          </div>

          <Badge status={tenantStatus} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4 bg-slate-50">
            <p className="text-xs text-slate-500">{t("tenantDetails.unit")}</p>
            <p className="font-semibold">{property?.address || "—"}</p>
            <p className="text-sm text-slate-500">
              {property?.city || ""}
            </p>
          </Card>

          <Card className="p-4 bg-slate-50">
            <p className="text-xs text-slate-500">{t("finance.table.paid")}</p>
            <p className="text-xl font-bold">{paidCount}</p>
          </Card>

          <Card className="p-4 bg-slate-50">
            <p className="text-xs text-slate-500">{t("finance.summary.overdue")}</p>
            <p className="text-xl font-bold text-rose-600">
              {overdueCount}
            </p>
          </Card>
        </div>
      </Card>

      <LeaseSummaryCard
        accountId={activeAccountId}
        propertyId={tenant.propertyId || null}
        tenantId={tenant.id}
        canManage={canManageLease}
      />

      <TenantTimelineCard
        accountId={activeAccountId}
        tenant={tenant}
        property={property}
      />

      {canUpdateTenant ? (
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-900">Edit tenant details</h3>
          <form className="mt-4 space-y-4" onSubmit={handleSaveTenantDetails}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-sm font-medium text-slate-700">Name</span>
                <input
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  value={editForm.name}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium text-slate-700">Email</span>
                <input
                  type="email"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  value={editForm.email}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, email: event.target.value }))
                  }
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium text-slate-700">Phone</span>
                <input
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  value={editForm.phone}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, phone: event.target.value }))
                  }
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium text-slate-700">Property</span>
                <select
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  value={editForm.propertyId}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, propertyId: event.target.value }))
                  }
                >
                  <option value="">No property</option>
                  {properties.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.address}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <CustomFieldsFormSection
              title="Custom tenant fields"
              definitions={editCustomFieldDefinitions}
              values={editCustomFieldValues}
              errors={editCustomFieldErrors}
              onChange={handleEditCustomFieldChange}
              disabled={savingEdit}
              emptyMessage="No custom tenant fields configured yet."
            />

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingEdit}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:bg-slate-400"
              >
                {savingEdit ? "Saving..." : "Save tenant"}
              </button>
            </div>
          </form>
        </Card>
      ) : null}

      <CustomFieldsReadOnlySection
        title="Custom tenant fields"
        rows={customFieldRows}
        loading={customFieldsLoading}
      />

      {/* ---------- TENANT DOCUMENTS ---------- */}
      <TenantDocumentsSection tenantId={tenant.id} />
    </div>
  );
}
