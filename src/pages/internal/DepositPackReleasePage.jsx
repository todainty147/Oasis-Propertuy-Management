import { useEffect, useRef, useState } from "react";

import { supabase } from "../../lib/supabase";

const PACK_TYPE        = "deposit_dispute_pack";
const TARGET_STATE     = "production";
const PACK_VERSION     = "gate_b1_v1";
const RELEASE_REF      = "gate-b1-production-release-20260717";
const RATIONALE        =
  "PO-approved Gate-B1 production release. Staging evidence complete across all 14 gates. Gate-B1G guard deployed. Pack version gate_b1_v1.";
const CONFIRMATION_KEY = "RELEASE DEPOSIT PACK";

async function readRegistryState() {
  const { data, error } = await supabase
    .from("deposit_pack_release_registry")
    .select("pack_type, release_state, pack_version, updated_at")
    .eq("pack_type", PACK_TYPE)
    .single();
  if (error) throw new Error(`Registry read failed: ${error.message}`);
  return data;
}

async function readLatestTransition() {
  const { data, error } = await supabase
    .from("deposit_pack_release_transitions")
    .select(
      "id, previous_release_state, new_release_state, release_reference, approved_by, approved_at, rationale, pack_version",
    )
    .eq("pack_type", PACK_TYPE)
    .order("approved_at", { ascending: false })
    .limit(1)
    .single();
  if (error && error.code !== "PGRST116") throw new Error(`Ledger read failed: ${error.message}`);
  return data || null;
}

async function executeTransition() {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error("No verified authenticated user session");
  }

  const { data, error } = await supabase.rpc("transition_deposit_pack_release_state", {
    p_pack_type:         PACK_TYPE,
    p_new_state:         TARGET_STATE,
    p_release_reference: RELEASE_REF,
    p_rationale:         RATIONALE,
    p_pack_version:      PACK_VERSION,
  });

  if (error) {
    throw new Error(`Transition failed: ${error.message}`);
  }

  return data;
}

export default function DepositPackReleasePage() {
  const [authUser,     setAuthUser]     = useState(null);
  const [registry,     setRegistry]     = useState(null);
  const [loadError,    setLoadError]    = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [executing,    setExecuting]    = useState(false);
  const [execError,    setExecError]    = useState("");
  const [result,       setResult]       = useState(null);
  const [postRegistry, setPostRegistry] = useState(null);
  const [postLedger,   setPostLedger]   = useState(null);
  const hasExecuted = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [{ data: { user } }, reg] = await Promise.all([
          supabase.auth.getUser(),
          readRegistryState(),
        ]);
        if (cancelled) return;
        setAuthUser(user);
        setRegistry(reg);
      } catch (err) {
        if (!cancelled) setLoadError(err.message);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const isInternalPreview = registry?.release_state === "internal_preview";
  const confirmationMatch = confirmation.trim() === CONFIRMATION_KEY;
  const canExecute        = isInternalPreview && confirmationMatch && !hasExecuted.current;

  async function handleExecute() {
    if (!canExecute || executing) return;
    setExecError("");
    setExecuting(true);
    try {
      const data = await executeTransition();
      hasExecuted.current = true;
      setResult(data);

      const [reg, ledger] = await Promise.all([
        readRegistryState(),
        readLatestTransition(),
      ]);
      setPostRegistry(reg);
      setPostLedger(ledger);
    } catch (err) {
      setExecError(err.message);
    } finally {
      setExecuting(false);
    }
  }

  const env = import.meta.env.VITE_SUPABASE_URL || "";

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-2xl space-y-6">

        <div className="rounded-xl border-2 border-rose-400 bg-rose-50 p-5">
          <p className="text-sm font-bold text-rose-800 uppercase tracking-wider">
            Internal operator action — temporary page
          </p>
          <p className="mt-1 text-xs text-rose-700">
            Remove this page and its route in the next commit after the transition is confirmed.
          </p>
        </div>

        {loadError ? (
          <div className="rounded-lg border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800">
            Failed to load: {loadError}
          </div>
        ) : null}

        <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
          <h1 className="text-xl font-bold text-slate-900">Deposit Pack — Production Release</h1>

          <table className="w-full text-sm border-collapse">
            <tbody>
              <Row label="Environment"    value={env} />
              <Row label="Authenticated user" value={authUser?.email ?? "—"} />
              <Row label="Pack type"      value={PACK_TYPE} />
              <Row
                label="Current state"
                value={registry ? registry.release_state : "loading…"}
                highlight={registry && !isInternalPreview ? "red" : registry ? "green" : undefined}
              />
              <Row label="Target state"   value={TARGET_STATE} />
              <Row label="Pack version"   value={PACK_VERSION} />
              <Row label="Release ref"    value={RELEASE_REF} />
            </tbody>
          </table>

          {registry && !isInternalPreview && !hasExecuted.current ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              Current state is <strong>{registry.release_state}</strong> — transition is not available.
              Only <code>internal_preview</code> may transition to production via this page.
            </div>
          ) : null}
        </div>

        {!hasExecuted.current && isInternalPreview ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
            <p className="text-sm text-slate-700">
              To authorise the transition, type{" "}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-900 font-mono">
                {CONFIRMATION_KEY}
              </code>{" "}
              exactly, then click Execute.
            </p>
            <input
              type="text"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder={CONFIRMATION_KEY}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              disabled={executing}
              aria-label="Typed confirmation"
            />
            {execError ? (
              <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">
                {execError}
              </div>
            ) : null}
            <button
              type="button"
              onClick={handleExecute}
              disabled={!canExecute || executing}
              className="w-full rounded-lg bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {executing ? "Executing…" : "Execute Transition"}
            </button>
          </div>
        ) : null}

        {hasExecuted.current && result ? (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-6 space-y-4">
            <p className="text-sm font-bold text-emerald-800 uppercase tracking-wider">
              Transition succeeded
            </p>
            <table className="w-full text-sm border-collapse">
              <tbody>
                <Row label="Result"            value={result.idempotent ? "idempotent (already done)" : "new transition recorded"} />
                <Row label="Pack type"         value={result.pack_type} />
                <Row label="Previous state"    value={result.previous_state} />
                <Row label="New state"         value={result.release_state} highlight="green" />
                <Row label="Pack version"      value={result.pack_version} />
                <Row label="Release reference" value={result.release_reference} />
                <Row label="Approved by"       value={result.approved_by} />
              </tbody>
            </table>

            {postRegistry ? (
              <>
                <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider mt-4">
                  Post-transition registry (re-read)
                </p>
                <table className="w-full text-sm border-collapse">
                  <tbody>
                    <Row label="release_state" value={postRegistry.release_state} highlight="green" />
                    <Row label="pack_version"  value={postRegistry.pack_version} />
                    <Row label="updated_at"    value={postRegistry.updated_at} />
                  </tbody>
                </table>
              </>
            ) : null}

            {postLedger ? (
              <>
                <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider mt-4">
                  Latest ledger event (re-read)
                </p>
                <table className="w-full text-sm border-collapse">
                  <tbody>
                    <Row label="id"                     value={postLedger.id} />
                    <Row label="previous_release_state" value={postLedger.previous_release_state} />
                    <Row label="new_release_state"      value={postLedger.new_release_state} highlight="green" />
                    <Row label="release_reference"      value={postLedger.release_reference} />
                    <Row label="approved_by"            value={postLedger.approved_by} />
                    <Row label="approved_at"            value={postLedger.approved_at} />
                    <Row label="pack_version"           value={postLedger.pack_version} />
                  </tbody>
                </table>
              </>
            ) : null}

            <div className="rounded-lg border border-emerald-400 bg-emerald-100 p-3 text-xs text-emerald-800">
              This page is now inert. Remove it and its route in the next commit.
            </div>
          </div>
        ) : null}

      </div>
    </div>
  );
}

function Row({ label, value, highlight }) {
  const valueClass =
    highlight === "green" ? "text-emerald-700 font-semibold" :
    highlight === "red"   ? "text-rose-700 font-semibold" :
    "text-slate-800";
  return (
    <tr className="border-b border-slate-100">
      <td className="py-2 pr-4 text-slate-500 w-48">{label}</td>
      <td className={`py-2 font-mono break-all ${valueClass}`}>{value ?? "—"}</td>
    </tr>
  );
}
