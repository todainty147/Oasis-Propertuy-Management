import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock,
  MessageSquareText,
  RefreshCw,
  Star,
  Users,
} from "lucide-react";

import { usePageTitle } from "../../layout/PageTitleContext";
import {
  getEarlyUserDetail,
  listEarlyUsers,
  updateFeedbackStatus,
} from "../../services/earlyUsersService";

const SIGNUP_TYPES = [
  ["", "All signup types"],
  ["landlord_self_serve", "Landlords"],
  ["tenant_invite", "Tenants"],
  ["contractor_invite", "Contractors"],
];

const FEEDBACK_STATUSES = [
  ["", "All feedback statuses"],
  ["not_contacted", "Not contacted"],
  ["contacted", "Contacted"],
  ["responded", "Responded"],
  ["declined", "Declined"],
  ["do_not_contact", "Do not contact"],
];

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function statusClass(status) {
  const value = String(status || "").toLowerCase();
  if (value === "responded") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200";
  if (value === "contacted") return "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200";
  if (value === "declined" || value === "do_not_contact") return "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200";
  return "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200";
}

function SummaryCard({ icon: Icon, label, value, detail }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-3">
        <span className="rounded-lg bg-slate-100 p-2 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <Icon size={18} />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{value}</p>
        </div>
      </div>
      {detail ? <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{detail}</p> : null}
    </div>
  );
}

export default function EarlyUsersPage() {
  const { setTitle } = usePageTitle();
  const [rows, setRows] = useState([]);
  const [signupType, setSignupType] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState("");
  const [founderOnly, setFounderOnly] = useState(false);
  const [selected, setSelected] = useState(null);
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [notes, setNotes] = useState("");
  const [rating, setRating] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setTitle("Early Users");
  }, [setTitle]);

  const refresh = useCallback(async () => {
    setError("");
    const data = await listEarlyUsers({
      signupType: signupType || null,
      feedbackStatus: feedbackStatus || null,
      founderOnly,
      limit: 200,
    });
    setRows(data);
    if (selected?.userId) {
      const next = data.find((row) => row.userId === selected.userId) || null;
      setSelected(next);
    }
  }, [feedbackStatus, founderOnly, selected?.userId, signupType]);

  useEffect(() => {
    refresh().catch((err) => setError(err.message || "Failed to load early users"));
  }, [refresh]);

  const summary = useMemo(() => {
    const founderCount = rows.filter((row) => row.founderOfferStatus).length;
    const activated = rows.filter((row) => row.activationScore > 0).length;
    const feedbackOptIn = rows.filter((row) => row.feedbackOptIn).length;
    const notContacted = rows.filter((row) => row.feedbackStatus === "not_contacted").length;
    return {
      total: rows.length,
      founderCount,
      activated,
      feedbackOptIn,
      notContacted,
    };
  }, [rows]);

  async function selectRow(row) {
    setSelected(row);
    setSelectedDetail(null);
    setNotes(row.feedbackNotes || "");
    setRating(row.feedbackRating ?? "");
    setError("");
    try {
      setSelectedDetail(await getEarlyUserDetail(row.userId, row.accountId));
    } catch (err) {
      setError(err.message || "Failed to load early user detail");
    }
  }

  async function updateSelected(status) {
    if (!selected?.userId || !selected?.accountId) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await updateFeedbackStatus({
        userId: selected.userId,
        accountId: selected.accountId,
        status,
        notes,
        rating,
        preferredChannel: selected.preferredChannel || "email",
      });
      setMessage(`Feedback status updated to ${status.replaceAll("_", " ")}.`);
      await refresh();
    } catch (err) {
      setError(err.message || "Failed to update feedback status");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Early Users</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Track signup source, founder offer status, activation milestones, and feedback outreach.
            </p>
          </div>
          <button
            type="button"
            onClick={() => refresh().catch((err) => setError(err.message))}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </section>

      {(error || message) && (
        <div className={`rounded-lg border p-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          {error || message}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard icon={Users} label="Signups" value={summary.total} detail="Current filtered cohort" />
        <SummaryCard icon={Star} label="Founders" value={summary.founderCount} detail="Founder offer present" />
        <SummaryCard icon={CheckCircle2} label="Activated" value={summary.activated} detail="At least one milestone" />
        <SummaryCard icon={MessageSquareText} label="Feedback opt-in" value={summary.feedbackOptIn} detail="Can be contacted" />
        <SummaryCard icon={Clock} label="Not contacted" value={summary.notContacted} detail="Waiting for follow-up" />
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <select
            value={signupType}
            onChange={(e) => setSignupType(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          >
            {SIGNUP_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select
            value={feedbackStatus}
            onChange={(e) => setFeedbackStatus(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          >
            {FEEDBACK_STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <label className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700">
            <input
              type="checkbox"
              checked={founderOnly}
              onChange={(e) => setFounderOnly(e.target.checked)}
              className="h-4 w-4 accent-blue-600"
            />
            Founder only
          </label>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-950/60">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Founder</th>
                  <th className="px-4 py-3">Activation</th>
                  <th className="px-4 py-3">Feedback</th>
                  <th className="px-4 py-3">Signed up</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {rows.map((row) => (
                  <tr
                    key={row.signupId}
                    onClick={() => selectRow(row)}
                    className={`cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 ${selected?.signupId === row.signupId ? "bg-blue-50 dark:bg-blue-950/20" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900 dark:text-slate-100">{row.accountName || row.fullName || row.email}</p>
                      <p className="text-xs text-slate-500">{row.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p>{row.signupSource || "—"}</p>
                      <p className="text-xs text-slate-500">{row.utmCampaign || row.utmSource || row.referrer || "No campaign"}</p>
                    </td>
                    <td className="px-4 py-3">{row.founderOfferStatus || "—"}</td>
                    <td className="px-4 py-3">{row.activationScore}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusClass(row.feedbackStatus)}`}>
                        {row.feedbackStatus.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(row.signedUpAt)}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan="6" className="px-4 py-8 text-center text-slate-500">No early users match these filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          {selected ? (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected user</p>
                <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{selected.accountName || selected.email}</h2>
                <p className="text-sm text-slate-500">{selected.email}</p>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-slate-500">Signup type</dt>
                  <dd>{selected.signupType}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Locale</dt>
                  <dd>{selected.locale || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Activation</dt>
                  <dd>{selected.activationScore}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Feedback opt-in</dt>
                  <dd>{selected.feedbackOptIn ? "Yes" : "No"}</dd>
                </div>
              </dl>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="feedback-notes">
                  Feedback notes
                </label>
                <textarea
                  id="feedback-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={5}
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="feedback-rating">
                  Rating
                </label>
                <input
                  id="feedback-rating"
                  type="number"
                  min="1"
                  max="5"
                  value={rating}
                  onChange={(e) => setRating(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {["contacted", "responded", "declined", "do_not_contact"].map((status) => (
                  <button
                    key={status}
                    type="button"
                    disabled={busy}
                    onClick={() => updateSelected(status)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    {status.replaceAll("_", " ")}
                  </button>
                ))}
              </div>
              {selectedDetail?.activationEvents ? (
                <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-950 dark:text-slate-300">
                  <p className="font-semibold text-slate-700 dark:text-slate-200">Activation events</p>
                  <pre className="mt-2 whitespace-pre-wrap break-words">{JSON.stringify(selectedDetail.activationEvents, null, 2)}</pre>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Select a row to review contact preference, notes, and activation detail.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
