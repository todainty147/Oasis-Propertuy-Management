// src/routes/ManagerRoutes.jsx
//
// All routes rendered inside the AppLayout shell for manager (owner/admin/staff)
// and contractor sessions. Contractor routes are included here because they share
// the AppLayout frame; each contractor page fetches its own scoped data.
//
// Tenant routes live in TenantRoutes.jsx and are mounted separately under /tenant.
//
// Data loading is done via usePortfolioShellData — this hook runs only for manager
// sessions. Tenant and contractor sessions never trigger portfolio-wide fetches.
import { useState, lazy } from "react";
import { Route, Navigate } from "react-router-dom";

import { useAccount } from "../context/AccountContext";
import { useI18n } from "../context/I18nContext";
import { ENTITLEMENT_FEATURES, assertUsageCapacity, getPlanUsageLimit, normalizePlan } from "../lib/entitlements";
import { isManageRole } from "../utils/permissions";
import { usePortfolioShellData } from "../hooks/usePortfolioShellData";
import {
  createProperty,
  updateProperty,
  deleteProperty,
} from "../services/propertyService";
import { saveEntityCustomFieldValues } from "../services/customFieldService";
import FeatureAccessCard from "../components/FeatureAccessCard";

const Dashboard                   = lazy(() => import("../pages/Dashboard"));
const Properties                  = lazy(() => import("../pages/Properties"));
const Tenants                     = lazy(() => import("../pages/Tenants"));
const PropertyDetails             = lazy(() => import("../pages/PropertyDetails"));
const TenantDetails               = lazy(() => import("../pages/TenantDetails"));
const Documents                   = lazy(() => import("../pages/Documents"));
const EvidenceVaultPage           = lazy(() => import("../pages/documents/EvidenceVaultPage"));
const EvidenceVaultPrintPage      = lazy(() => import("../pages/documents/EvidenceVaultPrintPage"));
const DepositDisputePacksPage     = lazy(() => import("../pages/documents/DepositDisputePacksPage"));
const DepositDisputePackPrintPage = lazy(() => import("../pages/documents/DepositDisputePackPrintPage"));
const MaintenanceInboxPage        = lazy(() => import("../pages/MaintenanceInboxPage"));
const MaintenanceKPIDashboardPage = lazy(() => import("../pages/MaintenanceKPIDashboardPage"));
const CommandCenterPage           = lazy(() => import("../pages/CommandCenterPage"));
const PortfolioHealthDashboardPage = lazy(() => import("../pages/PortfolioHealthDashboardPage"));
const EcoUpgradePlannerPage       = lazy(() => import("../pages/EcoUpgradePlannerPage"));
const FinancePage                 = lazy(() => import("../pages/FinancePage"));
const DepositVaultPage            = lazy(() => import("../pages/DepositVaultPage"));
const LandlordOnboardingPage      = lazy(() => import("../pages/LandlordOnboardingPage"));
const InvitationsPage             = lazy(() => import("../pages/InvitationsPage"));
const AccountBrandingPage         = lazy(() => import("../pages/AccountBrandingPage"));
const AccountLocalizationPage     = lazy(() => import("../pages/AccountLocalizationPage"));
const BillingPage                 = lazy(() => import("../pages/BillingPage"));
const RolesManagementPage = lazy(() => import("../pages/RolesManagementPage"));
const CustomFieldsManagementPage = lazy(() => import("../pages/CustomFieldsManagementPage"));
const ProfilePage                 = lazy(() => import("../pages/ProfilePage"));
const DataPrivacyPage             = lazy(() => import("../pages/DataPrivacyPage"));
const PlaybooksPage               = lazy(() => import("../pages/PlaybooksPage"));
const SecurityAuditPage           = lazy(() => import("../pages/SecurityAuditPage"));
const RootTelemetryPage           = lazy(() => import("../pages/RootTelemetryPage"));
const RootAccountsPage            = lazy(() => import("../pages/admin/RootAccountsPage"));
const RootDataRequestsPage        = lazy(() => import("../pages/admin/RootDataRequestsPage"));
const EarlyUsersPage              = lazy(() => import("../pages/admin/EarlyUsersPage"));
// TaxReadinessPage legacy contract: pages/compliance/TaxReadinessPage
const TaxToolsPage                = lazy(() => import("../pages/compliance/TaxToolsPage"));
const HmrcConnectionPage          = lazy(() => import("../pages/compliance/HmrcConnectionPage"));
const ComplianceSafePage          = lazy(() => import("../pages/compliance/ComplianceSafePage"));
const RentShieldPage              = lazy(() => import("../pages/compliance/RentShieldPage"));
const LeaseAuditorPage            = lazy(() => import("../pages/compliance/LeaseAuditorPage"));
const RentersRightsPage           = lazy(() => import("../pages/compliance/RentersRightsPage"));
const PolandCompliancePage        = lazy(() => import("../pages/compliance/PolandCompliancePage"));
const PlAdvancedPage              = lazy(() => import("../pages/compliance/PlAdvancedPage"));
const RentPlansPage               = lazy(() => import("../pages/RentPlansPage"));
const AddPropertyModal            = lazy(() => import("../components/AddPropertyModal"));
const OperatingCalendarPage       = lazy(() => import("../pages/OperatingCalendarPage"));
const ContractorPortal            = lazy(() => import("../pages/ContractorPortal"));
const ContractorJobDetails        = lazy(() => import("../pages/ContractorJobDetails"));
const WorkOrderDetails            = lazy(() => import("../pages/WorkOrderDetails"));
const ApplicationsPage            = lazy(() => import("../pages/applications/ApplicationsPage"));

// ── Route guard helpers ──────────────────────────────────────────────────────

function EntitledRoute({ feature, altFeature, children }) {
  const { activeRole, isRootOperator, canAccessTelemetry, hasEntitlement, activePlan } = useAccount();
  const role = String(activeRole || "").toLowerCase();
  const canManage = isManageRole(role, { isRootOperator });
  const canEvaluate = feature === ENTITLEMENT_FEATURES.ROOT_TELEMETRY
    ? canAccessTelemetry
    : canManage;

  if (!canEvaluate) {
    return <Navigate to="/dashboard" replace />;
  }

  if (hasEntitlement(feature)) {
    return children;
  }

  if (altFeature && hasEntitlement(altFeature)) {
    return children;
  }

  return <FeatureAccessCard feature={feature} currentPlan={activePlan} />;
}

function ManagerOnlyRoute({ children }) {
  const { activeRole, isRootOperator } = useAccount();
  const role = String(activeRole || "").toLowerCase();
  return isManageRole(role, { isRootOperator })
    ? children
    : <Navigate to="/dashboard" replace />;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ManagerRoutes() {
  const { t } = useI18n();
  const { activeAccountId, activeRole, activePlan } = useAccount();
  const tenantRole    = String(activeRole || "").toLowerCase() === "tenant";
  const contractorRole = String(activeRole || "").toLowerCase() === "contractor";

  // Portfolio data — only meaningful for manager sessions.
  // Contractors never trigger portfolio fetches (enabled=false for them).
  const managerDataEnabled = !!activeAccountId && !tenantRole && !contractorRole;

  const {
    propertiesLoading, paymentsLoading, tenantsLoading,
    propertiesError, paymentsError, tenantsError, leasesError,
    payments,
    ownerProperties, ownerTenants, ownerPayments,
    occupiedCount, vacantCount, occupancyRate, longVacantProperties,
    refetchProperties,
  } = usePortfolioShellData({ enabled: managerDataEnabled });

  // ── Property modal (shared by /properties and /properties/:id) ─────────────

  const [isAddPropertyOpen, setIsAddPropertyOpen]   = useState(false);
  const [editingProperty, setEditingProperty]       = useState(null);

  const safeActivePlan     = normalizePlan(activePlan);
  const propertyPlanLimit  = getPlanUsageLimit(safeActivePlan, "properties");
  const canCreateMoreProperties = propertyPlanLimit == null
    ? true
    : ownerProperties.length < propertyPlanLimit;

  function openAddPropertyModal() {
    if (!canCreateMoreProperties) {
      window.alert(
        t("properties.limitReached", {
          plan:  t(`billing.plan.${safeActivePlan}`),
          count: ownerProperties.length,
          limit: propertyPlanLimit,
        }),
      );
      return;
    }
    setEditingProperty(null);
    setIsAddPropertyOpen(true);
  }

  async function handlePropertySave(property) {
    if (!property.id) {
      if (!canCreateMoreProperties) {
        window.alert(
          t("properties.limitReached", {
            plan:  t(`billing.plan.${safeActivePlan}`),
            count: ownerProperties.length,
            limit: propertyPlanLimit,
          }),
        );
        return;
      }
      assertUsageCapacity(safeActivePlan, "properties", ownerProperties.length);
    }
    const payload = { ...property, accountId: activeAccountId };
    const savedProperty = property.id
      ? await updateProperty(property.id, payload)
      : await createProperty(payload);

    await saveEntityCustomFieldValues({
      accountId:   activeAccountId,
      entityId:    savedProperty?.id || property.id,
      definitions: property.customFieldDefinitions,
      values:      property.customFieldValues,
    });

    setIsAddPropertyOpen(false);
    setEditingProperty(null);
  }

  const sharedModal = (
    <AddPropertyModal
      isOpen={isAddPropertyOpen}
      onClose={() => { setIsAddPropertyOpen(false); setEditingProperty(null); }}
      onSave={handlePropertySave}
      property={editingProperty}
      tenants={ownerTenants}
      owners={[{ id: activeAccountId, name: activeAccountId }]}
    />
  );

  // ── Error boundary ────────────────────────────────────────────────────────

  if (managerDataEnabled && (propertiesError || paymentsError || tenantsError || leasesError)) {
    return (
      <div className="p-6 bg-white rounded-xl border">
        <p className="font-medium">{t("app.loadErrorTitle")}</p>
        <p className="mt-3 text-sm text-gray-600">{t("app.loadErrorRetry")}</p>
      </div>
    );
  }

  // ── Routes ────────────────────────────────────────────────────────────────
  // The modal is returned separately so App.jsx can render it outside <Routes>.
  // React Router v7 validates every child of <Routes>/<Route> as a Route element;
  // including the modal in the Fragment would cause a validation error.

  const routes = (
    <>
      <Route index element={<Navigate to="/dashboard" replace />} />

      <Route
        path="dashboard"
        element={
          tenantRole ? (
            <Navigate to="/tenant/home" replace />
          ) : contractorRole ? (
            <Navigate to="/contractor" replace />
          ) : (
            <Dashboard
              loading={propertiesLoading || paymentsLoading || tenantsLoading}
              properties={ownerProperties}
              tenants={ownerTenants}
              payments={payments}
              occupiedCount={occupiedCount}
              vacantCount={vacantCount}
              occupancyRate={occupancyRate}
              longVacantProperties={longVacantProperties}
            />
          )
        }
      />

      <Route
        path="properties"
        element={
          tenantRole ? (
            <Navigate to="/tenant/property" replace />
          ) : contractorRole ? (
            <Navigate to="/contractor" replace />
          ) : (
            <Properties
              loading={propertiesLoading}
              properties={ownerProperties}
              tenants={ownerTenants}
              activePlan={safeActivePlan}
              onAddProperty={openAddPropertyModal}
              onEditProperty={(p) => { setEditingProperty(p); setIsAddPropertyOpen(true); }}
              onDeleteProperty={async (propertyId) => {
                if (!confirm(t("properties.confirmDelete"))) return;
                await deleteProperty(propertyId);
                await refetchProperties();
              }}
            />
          )
        }
      />

      <Route
        path="properties/:id"
        element={
          tenantRole ? (
            <Navigate to="/tenant/property" replace />
          ) : contractorRole ? (
            <Navigate to="/contractor" replace />
          ) : (
            <PropertyDetails
              loading={propertiesLoading || tenantsLoading}
              properties={ownerProperties}
              tenants={ownerTenants}
              payments={ownerPayments}
              onEditProperty={(p) => { setEditingProperty(p); setIsAddPropertyOpen(true); }}
            />
          )
        }
      />

      <Route
        path="tenants"
        element={
          contractorRole ? (
            <Navigate to="/contractor" replace />
          ) : (
            <Tenants
              loading={tenantsLoading}
              tenants={ownerTenants}
              properties={ownerProperties}
              payments={payments}
            />
          )
        }
      />

      <Route
        path="tenants/:id"
        element={
          contractorRole ? (
            <Navigate to="/contractor" replace />
          ) : (
            <TenantDetails
              loading={tenantsLoading || paymentsLoading}
              tenants={ownerTenants}
              properties={ownerProperties}
              payments={payments}
            />
          )
        }
      />

      <Route
        path="finance"
        element={contractorRole ? <Navigate to="/contractor" replace /> : <FinancePage />}
      />

      <Route
        path="finance/deposit-vault"
        element={
          <EntitledRoute
            feature={ENTITLEMENT_FEATURES.DEPOSIT_DEDUCTIONS_LOG}
            altFeature={ENTITLEMENT_FEATURES.DEPOSIT_SETTLEMENT_STATEMENT}
          >
            <DepositVaultPage />
          </EntitledRoute>
        }
      />

      <Route
        path="documents"
        element={
          tenantRole ? (
            <Navigate to="/tenant/documents" replace />
          ) : contractorRole ? (
            <Navigate to="/contractor" replace />
          ) : (
            <Documents tenants={ownerTenants} properties={ownerProperties} />
          )
        }
      />

      <Route
        path="documents/evidence-vault"
        element={
          <EntitledRoute feature={ENTITLEMENT_FEATURES.EVIDENCE_VAULT}>
            <EvidenceVaultPage properties={ownerProperties} tenants={ownerTenants} />
          </EntitledRoute>
        }
      />

      <Route
        path="documents/evidence-vault/:reportId"
        element={
          <EntitledRoute feature={ENTITLEMENT_FEATURES.EVIDENCE_VAULT}>
            <EvidenceVaultPage properties={ownerProperties} tenants={ownerTenants} />
          </EntitledRoute>
        }
      />

      <Route
        path="documents/evidence-vault/:reportId/print"
        element={
          <EntitledRoute feature={ENTITLEMENT_FEATURES.EVIDENCE_VAULT}>
            <EvidenceVaultPrintPage properties={ownerProperties} tenants={ownerTenants} />
          </EntitledRoute>
        }
      />

      <Route
        path="documents/evidence-vault/dispute-packs"
        element={
          <EntitledRoute feature={ENTITLEMENT_FEATURES.EVIDENCE_VAULT_DISPUTE_PACK}>
            <DepositDisputePacksPage properties={ownerProperties} tenants={ownerTenants} />
          </EntitledRoute>
        }
      />

      <Route
        path="documents/evidence-vault/dispute-packs/:packId"
        element={
          <EntitledRoute feature={ENTITLEMENT_FEATURES.EVIDENCE_VAULT_DISPUTE_PACK}>
            <DepositDisputePacksPage properties={ownerProperties} tenants={ownerTenants} />
          </EntitledRoute>
        }
      />

      <Route
        path="documents/evidence-vault/dispute-packs/:packId/print"
        element={
          <EntitledRoute feature={ENTITLEMENT_FEATURES.EVIDENCE_VAULT_DISPUTE_PACK}>
            <DepositDisputePackPrintPage properties={ownerProperties} tenants={ownerTenants} />
          </EntitledRoute>
        }
      />

      <Route path="maintenance-inbox" element={<MaintenanceInboxPage />} />

      <Route
        path="applications"
        element={
          <EntitledRoute
            feature={ENTITLEMENT_FEATURES.TENANT_APPLICATION_LINKS}
            altFeature={ENTITLEMENT_FEATURES.APPLICANT_PRESCREENING_DASHBOARD}
          >
            <ApplicationsPage properties={ownerProperties} />
          </EntitledRoute>
        }
      />

      <Route
        path="maintenance-kpi"
        element={
          <EntitledRoute feature={ENTITLEMENT_FEATURES.MAINTENANCE_KPI}>
            <MaintenanceKPIDashboardPage />
          </EntitledRoute>
        }
      />

      <Route
        path="command-center"
        element={
          <EntitledRoute feature={ENTITLEMENT_FEATURES.COMMAND_CENTER}>
            <CommandCenterPage />
          </EntitledRoute>
        }
      />

      <Route
        path="attention-center"
        element={
          <EntitledRoute feature={ENTITLEMENT_FEATURES.COMMAND_CENTER}>
            <CommandCenterPage />
          </EntitledRoute>
        }
      />

      <Route path="landlord-onboarding" element={<LandlordOnboardingPage />} />
      <Route path="invitations" element={<InvitationsPage />} />

      <Route
        path="settings/profile"
        element={tenantRole ? <Navigate to="/tenant/profile" replace /> : <ProfilePage />}
      />
      <Route
        path="settings/data-privacy"
        element={<DataPrivacyPage />}
      />
      <Route
        path="settings/branding"
        element={<ManagerOnlyRoute><AccountBrandingPage /></ManagerOnlyRoute>}
      />
      <Route
        path="settings/localization"
        element={<ManagerOnlyRoute><AccountLocalizationPage /></ManagerOnlyRoute>}
      />
      <Route
        path="settings/billing"
        element={<ManagerOnlyRoute><BillingPage /></ManagerOnlyRoute>}
      />
      <Route
        path="settings/roles"
        element={<ManagerOnlyRoute><RolesManagementPage /></ManagerOnlyRoute>}
      />
      <Route
        path="settings/custom-fields"
        element={<ManagerOnlyRoute><CustomFieldsManagementPage /></ManagerOnlyRoute>}
      />
      <Route
        path="settings/playbooks"
        element={
          <EntitledRoute feature={ENTITLEMENT_FEATURES.PLAYBOOKS}>
            <PlaybooksPage />
          </EntitledRoute>
        }
      />
      <Route
        path="settings/security-audit"
        element={
          <EntitledRoute feature={ENTITLEMENT_FEATURES.SECURITY_AUDIT}>
            <SecurityAuditPage />
          </EntitledRoute>
        }
      />
      <Route
        path="settings/root-telemetry"
        element={
          <EntitledRoute feature={ENTITLEMENT_FEATURES.ROOT_TELEMETRY}>
            <RootTelemetryPage />
          </EntitledRoute>
        }
      />
      <Route
        path="root/accounts"
        element={
          <EntitledRoute feature={ENTITLEMENT_FEATURES.ROOT_TELEMETRY}>
            <RootAccountsPage />
          </EntitledRoute>
        }
      />
      <Route
        path="root/data-requests"
        element={
          <EntitledRoute feature={ENTITLEMENT_FEATURES.ROOT_TELEMETRY}>
            <RootDataRequestsPage />
          </EntitledRoute>
        }
      />
      <Route
        path="root/early-users"
        element={
          <EntitledRoute feature={ENTITLEMENT_FEATURES.ROOT_TELEMETRY}>
            <EarlyUsersPage />
          </EntitledRoute>
        }
      />

      <Route
        path="portfolio-health"
        element={
          <EntitledRoute feature={ENTITLEMENT_FEATURES.PORTFOLIO_HEALTH}>
            <PortfolioHealthDashboardPage />
          </EntitledRoute>
        }
      />

      <Route
        path="portfolio-health/eco-upgrade-planner"
        element={
          <EntitledRoute
            feature={ENTITLEMENT_FEATURES.ECO_UPGRADE_PLANNER}
            altFeature={ENTITLEMENT_FEATURES.PORTFOLIO_HEALTH_ECO_COMPLIANCE}
          >
            <EcoUpgradePlannerPage />
          </EntitledRoute>
        }
      />

      <Route
        path="compliance/tax"
        element={<Navigate to="/compliance/tax-tools" replace />}
      />
      <Route
        path="compliance/tax-tools"
        element={
          <EntitledRoute
            feature={ENTITLEMENT_FEATURES.TAX_TOOLS_IN_APP}
            altFeature={ENTITLEMENT_FEATURES.TAX_READINESS_DASHBOARD}
          >
            <TaxToolsPage properties={ownerProperties} />
          </EntitledRoute>
        }
      />
      <Route
        path="compliance/hmrc-connection"
        element={
          <EntitledRoute feature={ENTITLEMENT_FEATURES.HMRC_MTD_CONNECTION}>
            <HmrcConnectionPage />
          </EntitledRoute>
        }
      />
      <Route
        path="compliance/safe"
        element={
          <EntitledRoute feature={ENTITLEMENT_FEATURES.COMPLIANCE_SAFE}>
            <ComplianceSafePage properties={ownerProperties} tenants={ownerTenants} />
          </EntitledRoute>
        }
      />
      <Route
        path="compliance/rent-shield"
        element={
          <EntitledRoute feature={ENTITLEMENT_FEATURES.RENT_SHIELD}>
            <RentShieldPage />
          </EntitledRoute>
        }
      />
      <Route
        path="compliance/leases"
        element={
          <EntitledRoute feature={ENTITLEMENT_FEATURES.AI_LEASE_AUDITOR}>
            <LeaseAuditorPage />
          </EntitledRoute>
        }
      />
      <Route
        path="compliance/renters-rights"
        element={
          <EntitledRoute feature={ENTITLEMENT_FEATURES.RENTERS_RIGHTS_READINESS}>
            <RentersRightsPage />
          </EntitledRoute>
        }
      />
      <Route
        path="compliance/poland"
        element={
          <EntitledRoute feature={ENTITLEMENT_FEATURES.POLAND_COMPLIANCE}>
            <PolandCompliancePage />
          </EntitledRoute>
        }
      />
      <Route
        path="compliance/poland-advanced"
        element={
          <EntitledRoute feature={ENTITLEMENT_FEATURES.POLAND_COMPLIANCE}>
            <PlAdvancedPage />
          </EntitledRoute>
        }
      />
      <Route
        path="finance/rent-plans"
        element={
          <EntitledRoute feature={ENTITLEMENT_FEATURES.RENT_RULES_CORE}>
            <RentPlansPage />
          </EntitledRoute>
        }
      />

      <Route
        path="operating-calendar"
        element={<ManagerOnlyRoute><OperatingCalendarPage /></ManagerOnlyRoute>}
      />

      {/* Contractor routes — each page fetches its own scoped data */}
      <Route path="contractor" element={<ContractorPortal />} />
      <Route path="contractor/jobs/:id" element={<ContractorJobDetails />} />
      <Route path="work-orders/:id" element={<WorkOrderDetails />} />

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </>
  );

  return { modal: sharedModal, routes };
}
