import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import Card from "../components/Card";
import Skeleton from "../components/ui/Skeleton";
import ContractorAttachmentsPanel from "../components/work-orders/ContractorAttachmentsPanel";
import { useAccount } from "../context/AccountContext";
import { supabase } from "../lib/supabase";

function formatDateTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function formatMoney(val, currency = "PLN") {
  const n = Number(val);
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(2)} ${currency || "PLN"}`;
}

function toIsoOrNullFromLocalInput(v) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export default function ContractorJobDetails() {
  const { id } = useParams();
  const { activeRole, activeAccountId } = useAccount();

  const role = useMemo(() => String(activeRole ?? "").toLowerCase(), [activeRole]);
  const isContractor = useMemo(() => role === "contractor", [role]);

  const [row, setRow] = useState(null);
  const [fin, setFin] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [quoteAmount, setQuoteAmount] = useState("");
  const [quoteCurrency, setQuoteCurrency] = useState("PLN");
  const [quoteNotes, setQuoteNotes] = useState("");

  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [invoiceCurrency, setInvoiceCurrency] = useState("PLN");
  const [invoiceIssuedAt, setInvoiceIssuedAt] = useState("");
  const [invoiceDueAt, setInvoiceDueAt] = useState("");

  function syncFinInputs(f) {
    setQuoteAmount(f?.quote_amount != null ? String(f.quote_amount) : "");
    setQuoteCurrency(f?.quote_currency || "PLN");
    setQuoteNotes(f?.quote_notes || "");

    setInvoiceAmount(f?.invoice_amount != null ? String(f.invoice_amount) : "");
    setInvoiceCurrency(f?.invoice_currency || "PLN");

    const toLocal = (ts) => {
      if (!ts) return "";
      const d = new Date(ts);
      if (Number.isNaN(d.getTime())) return "";
      const pad = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
        d.getHours()
      )}:${pad(d.getMinutes())}`;
    };

    setInvoiceIssuedAt(toLocal(f?.invoice_issued_at));
    setInvoiceDueAt(toLocal(f?.invoice_due_at));
  }

  async function loadAll() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("work_orders")
        .select("id, status, scheduled_at, notes, contractor_name, contractor_phone, created_at, updated_at")
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;
      setRow(data ?? null);

      // Financials: may not exist yet
      const { data: f, error: fe } = await supabase
        .from("work_order_financials")
        .select(
          "id, account_id, work_order_id, quote_amount, quote_currency, quote_notes, quote_status, quote_submitted_at, quote_submitted_by, invoice_amount, invoice_currency, invoice_issued_at, invoice_due_at, approved_at, approved_by, rejected_at, rejected_by, rejection_reason, created_at, updated_at"
        )
        .eq("work_order_id", id)
        .maybeSingle();

      if (!fe) {
        setFin(f ?? null);
        syncFinInputs(f ?? null);
      } else {
        setFin(null);
      }
    } catch (e) {
      console.error(e);
      setRow(null);
      setFin(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!alive) return;
      await loadAll();
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function saveQuoteDraft() {
    const amt = Number(quoteAmount);
    if (!Number.isFinite(amt)) {
      alert("Podaj poprawną kwotę wyceny");
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("wo_fin_upsert_quote_draft", {
        p_work_order_id: id,
        p_quote_amount: amt,
        p_quote_currency: quoteCurrency || "PLN",
        p_quote_notes: quoteNotes || null,
      });
      if (error) throw error;

      setFin(data ?? null);
      syncFinInputs(data ?? null);
    } catch (e) {
      alert(e?.message ?? "Nie udało się zapisać draftu wyceny");
    } finally {
      setSaving(false);
    }
  }

  async function submitQuote() {
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("wo_fin_submit_quote", {
        p_work_order_id: id,
      });
      if (error) throw error;
      setFin(data ?? null);
      syncFinInputs(data ?? null);
    } catch (e) {
      alert(e?.message ?? "Nie udało się wysłać wyceny");
    } finally {
      setSaving(false);
    }
  }

  async function saveInvoice() {
    const amt = invoiceAmount === "" ? null : Number(invoiceAmount);
    if (amt !== null && !Number.isFinite(amt)) {
      alert("Podaj poprawną kwotę faktury");
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("wo_fin_upsert_invoice", {
        p_work_order_id: id,
        p_invoice_amount: amt,
        p_invoice_currency: invoiceCurrency || "PLN",
        p_invoice_issued_at: toIsoOrNullFromLocalInput(invoiceIssuedAt),
        p_invoice_due_at: toIsoOrNullFromLocalInput(invoiceDueAt),
      });
      if (error) throw error;

      setFin(data ?? null);
      syncFinInputs(data ?? null);
    } catch (e) {
      alert(e?.message ?? "Nie udało się zapisać faktury");
    } finally {
      setSaving(false);
    }
  }

  if (!isContractor) {
    return (
      <Card className="p-6">
        <p className="text-sm text-slate-600">
          Ten ekran jest dostępny tylko dla kont wykonawców (contractor).
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Szczegóły zlecenia</h2>
            <p className="text-xs text-slate-500 mt-1">ID: {id}</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={loadAll}
              className="text-sm px-3 py-2 rounded-lg border hover:bg-slate-50"
              disabled={loading || saving}
            >
              Odśwież
            </button>
            <Link
              to="/contractor"
              className="text-sm px-3 py-2 rounded-lg border hover:bg-slate-50"
            >
              Wróć
            </Link>
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : !row ? (
        <Card className="p-6">
          <p className="text-sm text-slate-600">Nie znaleziono zlecenia (lub brak dostępu).</p>
        </Card>
      ) : (
        <>
          <Card className="p-6 space-y-2">
            <div className="text-sm">
              <span className="text-slate-500">Status:</span>{" "}
              <span className="font-medium text-slate-900">{row.status}</span>
            </div>
            <div className="text-sm">
              <span className="text-slate-500">Termin:</span>{" "}
              <span className="text-slate-900">{formatDateTime(row.scheduled_at)}</span>
            </div>
            <div className="text-sm">
              <span className="text-slate-500">Wykonawca:</span>{" "}
              <span className="text-slate-900">{row.contractor_name || "—"}</span>
            </div>
            <div className="text-sm">
              <span className="text-slate-500">Telefon:</span>{" "}
              <span className="text-slate-900">{row.contractor_phone || "—"}</span>
            </div>
            <div className="text-sm">
              <span className="text-slate-500">Notatki (zlecenie):</span>{" "}
              <span className="text-slate-900">{row.notes || "—"}</span>
            </div>
          </Card>

          <Card className="p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Finanse</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Wykonawca tworzy draft wyceny → wysyła → po zatwierdzeniu może dodać fakturę.
                </p>
              </div>
            </div>

            {!fin ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-slate-600">Brak rekordu finansów. Zapisz draft wyceny, aby utworzyć.</p>
                <button
                  type="button"
                  onClick={saveQuoteDraft}
                  disabled={saving}
                  className={`px-3 py-2 text-sm rounded-lg text-white ${saving ? "bg-slate-400" : "bg-blue-600"}`}
                >
                  {saving ? "Zapisywanie…" : "Utwórz draft"}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="border rounded-lg p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-900">Wycena</div>
                    <div className="text-xs text-slate-500">
                      Status: <span className="font-medium">{fin.quote_status}</span>
                      {fin.quote_submitted_at ? ` • wysłano: ${formatDateTime(fin.quote_submitted_at)}` : ""}
                      {fin.approved_at ? ` • zatw.: ${formatDateTime(fin.approved_at)}` : ""}
                      {fin.rejected_at ? ` • odrz.: ${formatDateTime(fin.rejected_at)}` : ""}
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-slate-500">Kwota</label>
                      <input
                        value={quoteAmount}
                        onChange={(e) => setQuoteAmount(e.target.value)}
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm disabled:bg-slate-50"
                        disabled={saving || fin.quote_status === "submitted" || fin.quote_status === "approved"}
                        placeholder="np. 250.00"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Waluta</label>
                      <select
                        value={quoteCurrency}
                        onChange={(e) => setQuoteCurrency(e.target.value)}
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm disabled:bg-slate-50"
                        disabled={saving || fin.quote_status === "submitted" || fin.quote_status === "approved"}
                      >
                        {["PLN", "GBP", "EUR", "USD"].map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Podgląd</label>
                      <div className="mt-1 border rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-700">
                        {formatMoney(fin.quote_amount, fin.quote_currency)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3">
                    <label className="text-xs text-slate-500">Notatki do wyceny</label>
                    <textarea
                      value={quoteNotes}
                      onChange={(e) => setQuoteNotes(e.target.value)}
                      className="mt-1 w-full border rounded-lg px-3 py-2 text-sm min-h-[90px] disabled:bg-slate-50"
                      disabled={saving || fin.quote_status === "submitted" || fin.quote_status === "approved"}
                      placeholder="Opcjonalnie"
                    />
                  </div>

                  {fin.quote_status === "rejected" && fin.rejection_reason && (
                    <div className="mt-3 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">
                      Odrzucono: {fin.rejection_reason}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2 justify-end">
                    <button
                      type="button"
                      onClick={saveQuoteDraft}
                      disabled={saving || fin.quote_status === "submitted" || fin.quote_status === "approved"}
                      className={`px-3 py-2 text-sm rounded-lg text-white ${
                        saving || fin.quote_status === "submitted" || fin.quote_status === "approved"
                          ? "bg-slate-400"
                          : "bg-blue-600"
                      }`}
                    >
                      {saving ? "Zapisywanie…" : "Zapisz draft"}
                    </button>

                    {(fin.quote_status === "draft" || fin.quote_status === "rejected") && (
                      <button
                        type="button"
                        onClick={submitQuote}
                        disabled={saving}
                        className={`px-3 py-2 text-sm rounded-lg text-white ${saving ? "bg-slate-400" : "bg-slate-900"}`}
                      >
                        Wyślij wycenę
                      </button>
                    )}
                  </div>
                </div>

                <div className="border rounded-lg p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-900">Faktura</div>
                    <div className="text-xs text-slate-500">
                      {fin.invoice_amount != null
                        ? `Kwota: ${formatMoney(fin.invoice_amount, fin.invoice_currency)}`
                        : "Brak kwoty"}
                    </div>
                  </div>

                  {fin.quote_status !== "approved" ? (
                    <p className="text-sm text-slate-600 mt-3">
                      Fakturę można dodać dopiero po zatwierdzeniu wyceny przez właściciela.
                    </p>
                  ) : (
                    <>
                      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-slate-500">Kwota faktury</label>
                          <input
                            value={invoiceAmount}
                            onChange={(e) => setInvoiceAmount(e.target.value)}
                            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm disabled:bg-slate-50"
                            disabled={saving}
                            placeholder="np. 300.00"
                          />
                        </div>

                        <div>
                          <label className="text-xs text-slate-500">Waluta</label>
                          <select
                            value={invoiceCurrency}
                            onChange={(e) => setInvoiceCurrency(e.target.value)}
                            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm disabled:bg-slate-50"
                            disabled={saving}
                          >
                            {["PLN", "GBP", "EUR", "USD"].map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-xs text-slate-500">Data wystawienia</label>
                          <input
                            type="datetime-local"
                            value={invoiceIssuedAt}
                            onChange={(e) => setInvoiceIssuedAt(e.target.value)}
                            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm disabled:bg-slate-50"
                            disabled={saving}
                          />
                        </div>

                        <div>
                          <label className="text-xs text-slate-500">Termin płatności</label>
                          <input
                            type="datetime-local"
                            value={invoiceDueAt}
                            onChange={(e) => setInvoiceDueAt(e.target.value)}
                            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm disabled:bg-slate-50"
                            disabled={saving}
                          />
                        </div>
                      </div>

                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          onClick={saveInvoice}
                          disabled={saving}
                          className={`px-3 py-2 text-sm rounded-lg text-white ${saving ? "bg-slate-400" : "bg-blue-600"}`}
                        >
                          {saving ? "Zapisywanie…" : "Zapisz fakturę"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </Card>

          <ContractorAttachmentsPanel
            accountId={activeAccountId}
            workOrderId={id}
            canUpload={isContractor}
          />
        </>
      )}
    </div>
  );
}
