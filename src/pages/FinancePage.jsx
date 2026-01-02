// src/pages/FinancePage.jsx
import { useState } from "react";
import Finance from "./Finance";
import { useFinance } from "../hooks/useFinance";
import {
  createPayment,
  deletePayment,
} from "../services/paymentService";

export default function FinancePage() {
  const {
    summary,
    payments,
    propertyFinance,
    loading,
  } = useFinance({ enabled: true });

  const [isAddOpen, setIsAddOpen] = useState(false);

  return (
    <>
      <Finance
        loading={loading}
        summary={summary}
        payments={payments}
        propertyFinance={propertyFinance}
        onAddPayment={() => setIsAddOpen(true)}
        onDeletePayment={deletePayment}
      />

      {/* AddPaymentModal goes here */}
    </>
  );
}
