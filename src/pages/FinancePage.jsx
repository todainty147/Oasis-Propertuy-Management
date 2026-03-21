// src/pages/FinancePage.jsx
import { useState } from "react";
import { Navigate } from "react-router-dom";
import Finance from "./Finance";
import AddPaymentModal from "../components/AddPaymentModal";
import { useFinance } from "../hooks/useFinance";
import { useAccount } from "../context/AccountContext";
import { useProperties } from "../hooks/useProperties";
import { useTenants } from "../hooks/useTenants";
import { createPayment, deletePayment, updatePayment } from "../services/paymentService";
import { PAYMENT_STATUS } from "../utils/statuses";

export default function FinancePage() {
  const { activeAccountId, activeRole } = useAccount();
  const { properties, loading: propertiesLoading } = useProperties({ enabled: true });
  const { tenants, loading: tenantsLoading } = useTenants({ enabled: true });
  const {
    summary,
    payments,
    propertyFinance,
    loading,
  } = useFinance({ enabled: true });

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);

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
        onAddPayment={() => {
          setEditingPayment(null);
          setIsAddOpen(true);
        }}
        onDeletePayment={deletePayment}
      />

      <AddPaymentModal
        isOpen={isAddOpen}
        onClose={() => {
          setIsAddOpen(false);
          setEditingPayment(null);
        }}
        payment={editingPayment}
        properties={properties}
        tenants={tenants}
        onSave={async (form) => {
          const paidAt =
            form.status === PAYMENT_STATUS.PAID
              ? new Date().toISOString().slice(0, 10)
              : null;

          const payload = {
            accountId: activeAccountId,
            propertyId: form.propertyId,
            tenantId: form.tenantId,
            amount: Number(form.amount),
            dueDate: form.dueDate,
            paidAt,
          };

          if (form.id) {
            await updatePayment(form.id, payload);
          } else {
            await createPayment(payload);
          }
        }}
      />
    </>
  );
}
