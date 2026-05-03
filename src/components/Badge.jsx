import { useI18n } from "../context/I18nContext";
import {
  normalizeOccupancyStatus,
  normalizePaymentStatus,
  occupancyStatusLabelKey,
  paymentStatusLabelKey,
} from "../utils/statuses";

export default function Badge({ status }) {
  const { t } = useI18n();

  const normalizedPayment = normalizePaymentStatus(status);
  const normalizedOccupancy = normalizeOccupancyStatus(status);
  const paymentLabelKey = paymentStatusLabelKey(status);
  const occupancyLabelKey = occupancyStatusLabelKey(status);

  let style = "bg-gray-100 text-gray-800";
  let label = status;

  if (normalizedPayment === "paid") {
    style = "bg-emerald-100 text-emerald-700";
    label = paymentLabelKey ? t(paymentLabelKey) : status;
  } else if (normalizedPayment === "pending" || normalizedPayment === "partial") {
    style = "bg-amber-100 text-amber-700";
    label = paymentLabelKey ? t(paymentLabelKey) : status;
  } else if (normalizedPayment === "overdue") {
    style = "bg-rose-100 text-rose-700";
    label = paymentLabelKey ? t(paymentLabelKey) : status;
  } else if (normalizedOccupancy === "occupied") {
    style = "bg-emerald-100 text-emerald-700";
    label = occupancyLabelKey ? t(occupancyLabelKey) : status;
  } else if (normalizedOccupancy === "vacant") {
    style = "bg-slate-100 text-slate-600";
    label = occupancyLabelKey ? t(occupancyLabelKey) : status;
  } else if (status === "Standard") {
    style = "bg-blue-100 text-blue-700";
  } else if (status === "Protokół") {
    style = "bg-purple-100 text-purple-700";
  } else if (status === "Prawne") {
    style = "bg-gray-100 text-gray-700";
  }

  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${style}`}>
      {label}
    </span>
  );
}
