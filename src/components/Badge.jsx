export default function Badge({ status }) {
  const styles = {
    "Opłacone": "bg-emerald-100 text-emerald-700",
    "Wynajęte": "bg-emerald-100 text-emerald-700",
    "Oczekujące": "bg-amber-100 text-amber-700",
    "Wolne": "bg-slate-100 text-slate-600",
    "Zaległe": "bg-rose-100 text-rose-700",
    "Standard": "bg-blue-100 text-blue-700",
    "Protokół": "bg-purple-100 text-purple-700",
    "Prawne": "bg-gray-100 text-gray-700",
  };

  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status] || "bg-gray-100 text-gray-800"}`}>
      {status}
    </span>
  );
}
