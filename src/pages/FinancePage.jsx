// src/pages/FinancePage.jsx
import { useCallback, useState } from "react";
import { Navigate } from "react-router-dom";
import Finance from "./Finance";
import AddPaymentModal from "../components/AddPaymentModal";
import { useFinance } from "../hooks/useFinance";
import { useAccount } from "../context/AccountContext";
import { useProperties } from "../hooks/useProperties";
import { useTenants } from "../hooks/useTenants";
import {
  createPayment,
  deletePayment,
  markPaymentPaid,
  updatePayment,
} from "../services/paymentService";

export default function FinancePage() {
  const { activeAccountId, activeRole } = useAccount();
  const { properties, loading: propertiesLoading } = useProperties({ enabled: true });
  const { tenants,    loading: tenantsLoading    } = useTenants({ enabled: true });
  const {
    summary,
    payments,
    propertyFinance,
    loading,
    reload,
  } = useFinance({ enabled: true });

  const [isAddOpen,      setIsAddOpen]      = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);

  // B-5: unified mutation state — loading + error surfaced to Finance component
  const [mutating,      setMutating]      = useState(false);
  const [mutationError, setMutationError] = useState(null);

  // ── Mutation helper (defined before any early returns — Rules of Hooks) ───────

  const runMutation = useCallback(async (fn) => {
    setMutating(true);
    setMutationError(null);
    try {
      await fn();
      // B-5: explicit refresh rather than relying solely on realtime
      if (reload) await reload({ forceRefresh: true });
    } catch (err) {
      setMutationError(err?.message || "Operation failed. Please try again.");
    } finally {
      setMutating(false);
    }
  }, [reload]);

  // ── Handlers (all useCallback before early returns) ──────────────────────────

  const handleDeletePayment = useCallback((paymentId) => {
    runMutation(() => deletePayment(paymentId, activeAccountId));
  }, [runMutation, activeAccountId]);

  const handleMarkPaid = useCallback((paymentId) => {
    runMutation(() =>
      markPaymentPaid(paymentId, new Date().toISOString().slice(0, 10), activeAccountId)
    );
  }, [runMutation, activeAccountId]);

  // B-3: edit flow — pass the existing payment into the modal
  const handleEditPayment = useCallback((payment) => {
    setEditingPayment(payment);
    setIsAddOpen(true);
  }, []);

  // B-2/B-4: save handler with try-catch; status is not passed to the RPC.
  const handleSave = useCallback(async (form) => {
    if (form.id) {
      // Edit: only amount (if unpaid), dueDate, notes are editable.
      await updatePayment(form.id, {
        accountId: activeAccountId,
        amount:    form.amount ? Number(form.amount) : null,
        dueDate:   form.dueDate || null,
        notes:     form.notes   || null,
      });
    } else {
      // Create: paidAt derived from markAsPaid flag in the form
      await createPayment({
        accountId:  activeAccountId,
        propertyId: form.propertyId,
        tenantId:   form.tenantId,
        amount:     Number(form.amount),
        dueDate:    form.dueDate,
        paidAt:     form.markAsPaid ? new Date().toISOString().slice(0, 10) : null,
        notes:      form.notes || null,
      });
    }
    if (reload) await reload({ forceRefresh: true });
  }, [activeAccountId, reload]);

  // ── Tenant redirect (after all hooks) ────────────────────────────────────────

  if (String(activeRole || "").toLowerCase() === "tenant") {
    return <Navigate to="/tenant/payments" replace />;
  }

  return (
    <>
      <Finance
        loading={loading || propertiesLoading || tenantsLoading}
        summary={summary}
        payments={payments}
        propertyFinance={propertyFinance}
        mutating={mutating}
        mutationError={mutationError}
        onAddPayment={() => {
          setEditingPayment(null);
          setIsAddOpen(true);
        }}
        onEditPayment={handleEditPayment}
        onDeletePayment={handleDeletePayment}
        onMarkPaid={handleMarkPaid}
      />

      <AddPaymentModal
        isOpen={isAddOpen}
        onClose={() => {
          setIsAddOpen(false);
          setEditingPayment(null);
          setMutationError(null);
        }}
        payment={editingPayment}
        properties={properties}
        tenants={tenants}
        onSave={handleSave}
      />
    </>
  );
}
