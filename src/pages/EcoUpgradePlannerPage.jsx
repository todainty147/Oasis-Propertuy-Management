import { useCallback, useEffect, useMemo, useState } from "react";
import { Hammer, Save } from "lucide-react";

import Card from "../components/Card";
import { useAccount } from "../context/AccountContext";
import { useProperties } from "../hooks/useProperties";
import {
  calculateUpgradePlanTotals,
  estimateUpgradeImpact,
  getEpcRiskLevel,
} from "../lib/ecoUpgradePlanner";
import {
  createEcoUpgradePlan,
  createEcoUpgradeWorkOrderLink,
  getPropertyEpcProfile,
  listEcoUpgradeOptions,
  listEcoUpgradePlans,
  recalculateEcoUpgradePlan,
  upsertEcoUpgradePlanItem,
  upsertPropertyEpcProfile,
} from "../services/ecoUpgradePlannerService";
import { formatCurrencyAmount } from "../utils/currency";

const fieldClass = "rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950";
const SAFE_COPY =
  "Current minimum standard for most domestic private rented property in England and Wales is EPC E unless a valid exemption applies. Future policy may require higher standards, so this planner helps landlords prepare.";

function riskTone(level) {
  if (level === "critical") return "border-rose-200 bg-rose-50 text-rose-800";
  if (level === "warning") return "border-amber-200 bg-amber-50 text-amber-800";
  if (level === "planning") return "border-blue-200 bg-blue-50 text-blue-800";
  if (level === "good") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function riskCopy(level) {
  if (level === "critical") return "Below EPC E. Review urgently and check whether an exemption applies.";
  if (level === "warning") return "At EPC E. Keep evidence visible and plan ahead for possible future standards.";
  if (level === "planning") return "Planning opportunity. Review practical upgrades before the next EPC refresh.";
  if (level === "good") return "Currently at or above the planning target.";
  return "EPC data needed. Add the current band or score to improve the planning estimate.";
}

function confidenceCopy(confidence) {
  return confidence === "medium"
    ? "Confidence: medium, based on the EPC details and selected upgrade estimates entered here."
    : "Confidence: low until EPC details and selected upgrades are added.";
}

function saveErrorCopy(error) {
  const message = String(error?.message || "");
  if (/row-level security|permission|not authorized|not authorised/i.test(message)) {
    return "Could not save this plan. Check you have manager access for this account, then try again.";
  }
  if (/invalid input syntax|date\/time field|current_epc_score|last_epc_date/i.test(message)) {
    return "Could not save this plan. Check the EPC score and certificate date fields, then try again.";
  }
  return "Could not save this plan. Please check the property and try again.";
}

export default function EcoUpgradePlannerPage() {
  const { activeAccountId } = useAccount();
  const { properties } = useProperties({ enabled: true });
  const [propertyId, setPropertyId] = useState("");
  const [profile, setProfile] = useState({
    current_epc_band: "unknown",
    current_epc_score: "",
    target_epc_band: "C",
    property_type: "",
    heating_type: "",
    insulation_notes: "",
    last_epc_date: "",
    epc_certificate_document_id: "",
  });
  const [items, setItems] = useState([]);
  const [plans, setPlans] = useState([]);
  const [activePlanId, setActivePlanId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const firstPropertyId = properties[0]?.id ? String(properties[0].id) : "";
  const effectivePropertyId = propertyId || firstPropertyId;

  const reload = useCallback(async () => {
    if (!activeAccountId || !effectivePropertyId) return;
    setError("");
    try {
      const [profileRow, optionRows, planRows] = await Promise.all([
        getPropertyEpcProfile({ accountId: activeAccountId, propertyId: effectivePropertyId }),
        listEcoUpgradeOptions(),
        listEcoUpgradePlans({ accountId: activeAccountId, propertyId: effectivePropertyId }),
      ]);
      if (profileRow) {
        setProfile({
          current_epc_band: profileRow.current_epc_band || "unknown",
          current_epc_score: profileRow.current_epc_score || "",
          target_epc_band: profileRow.target_epc_band || "C",
          property_type: profileRow.property_type || "",
          heating_type: profileRow.heating_type || "",
          insulation_notes: profileRow.insulation_notes || "",
          last_epc_date: profileRow.last_epc_date || "",
          epc_certificate_document_id: profileRow.epc_certificate_document_id || "",
          id: profileRow.id,
        });
      }
      const plan = planRows[0] || null;
      setPlans(planRows);
      setActivePlanId(plan?.id || "");
      setItems(
        (plan?.property_eco_upgrade_plan_items?.length
          ? plan.property_eco_upgrade_plan_items.map((item) => ({
              ...item.eco_upgrade_options,
              id: item.id,
              plan_item_id: item.id,
              upgrade_option_id: item.upgrade_option_id,
              selected: item.selected,
              estimated_cost: item.estimated_cost,
              estimated_epc_points_gain: item.estimated_epc_points_gain,
              priority: item.priority,
              notes: item.notes || "",
              completed_at: item.completed_at,
              linked_work_order_id: item.linked_work_order_id,
            }))
          : optionRows.slice(0, 6).map((option) => ({
              ...option,
              selected: true,
              estimated_cost: Math.round((Number(option.typical_cost_low || 0) + Number(option.typical_cost_high || 0)) / 2),
              estimated_epc_points_gain: Math.round((Number(option.estimated_epc_points_low || 0) + Number(option.estimated_epc_points_high || 0)) / 2),
              priority: "medium",
              notes: "",
            })))
      );
    } catch (err) {
      setError(err?.message || "Could not load Eco-Upgrade Planner.");
    }
  }, [activeAccountId, effectivePropertyId]);

  useEffect(() => {
    Promise.resolve().then(reload);
  }, [reload]);

  const impact = useMemo(() => estimateUpgradeImpact(profile, items.filter((item) => item.selected)), [profile, items]);
  const totals = useMemo(() => calculateUpgradePlanTotals(items), [items]);
  const selectedProperty = properties.find((property) => String(property.id) === String(effectivePropertyId));
  const riskLevel = getEpcRiskLevel(profile);

  function updateItem(index, patch) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  async function handleSavePlan() {
    if (!effectivePropertyId) return;
    setError("");
    setMessage("");
    try {
      const savedProfile = await upsertPropertyEpcProfile({ accountId: activeAccountId, propertyId: effectivePropertyId, ...profile });
      const plan = activePlanId
        ? { id: activePlanId }
        : await createEcoUpgradePlan({
            accountId: activeAccountId,
            propertyId: effectivePropertyId,
            epcProfileId: savedProfile.id,
            targetBand: profile.target_epc_band,
            items,
            profile: savedProfile,
          });
      setActivePlanId(plan.id);
      await Promise.all(items.filter((item) => item.selected).map((item) => {
        const upgradeOptionId = Object.prototype.hasOwnProperty.call(item, "upgrade_option_id")
          ? item.upgrade_option_id
          : item.id;
        return upsertEcoUpgradePlanItem(plan.id, {
          id: item.plan_item_id || (item.id && item.upgrade_option_id ? item.id : undefined),
          accountId: activeAccountId,
          upgradeOptionId,
          selected: item.selected,
          estimatedCost: item.estimated_cost,
          estimatedEpcPointsGain: item.estimated_epc_points_gain,
          priority: item.priority,
          notes: item.notes,
        });
      }));
      await recalculateEcoUpgradePlan(plan.id);
      setMessage("Eco-Upgrade Planner saved. Estimates remain indicative and should be reviewed with an EPC assessor.");
      await reload();
    } catch (err) {
      setError(saveErrorCopy(err));
    }
  }

  async function handleWorkOrderStub(item) {
    if (!item.plan_item_id) {
      setMessage("Save the plan before creating an upgrade work order handoff.");
      return;
    }
    try {
      await createEcoUpgradeWorkOrderLink(item.plan_item_id, { notes: "Upgrade / energy efficiency work order handoff prepared." });
      setMessage("Work order handoff prepared. Create the work order from Maintenance and link it back when available.");
      await reload();
    } catch (err) {
      setError(err?.message || "Could not prepare work order handoff.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600">Portfolio Health / Eco-Upgrade Planner</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">Eco-Upgrade Planner</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-300">
          Plan EPC improvements with indicative costs, upgrade checklists and work-order handoff.
        </p>
        <p className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">{SAFE_COPY}</p>
      </div>

      {message ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div> : null}
      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="!p-5">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">EPC profile form</h2>
          <div className="mt-4 grid gap-3">
            <select className={fieldClass} value={effectivePropertyId} onChange={(event) => setPropertyId(event.target.value)}>
              <option value="">Select property</option>
              {properties.map((property) => <option key={property.id} value={property.id}>{property.address || property.name}</option>)}
            </select>
            <div className="grid gap-3 sm:grid-cols-3">
              <select className={fieldClass} value={profile.current_epc_band} onChange={(event) => setProfile((current) => ({ ...current, current_epc_band: event.target.value }))}>
                {["unknown","A","B","C","D","E","F","G"].map((band) => <option key={band} value={band}>{band}</option>)}
              </select>
              <input className={fieldClass} type="number" min="1" max="100" placeholder="Current EPC score optional" value={profile.current_epc_score} onChange={(event) => setProfile((current) => ({ ...current, current_epc_score: event.target.value }))} />
              <select aria-label="Planning target EPC band" className={fieldClass} value={profile.target_epc_band} onChange={(event) => setProfile((current) => ({ ...current, target_epc_band: event.target.value }))}>
                {["A","B","C","D","E"].map((band) => <option key={band} value={band}>Band {band}</option>)}
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input className={fieldClass} placeholder="Property type" value={profile.property_type} onChange={(event) => setProfile((current) => ({ ...current, property_type: event.target.value }))} />
              <input className={fieldClass} placeholder="Heating type" value={profile.heating_type} onChange={(event) => setProfile((current) => ({ ...current, heating_type: event.target.value }))} />
              <input className={fieldClass} type="date" value={profile.last_epc_date} onChange={(event) => setProfile((current) => ({ ...current, last_epc_date: event.target.value }))} />
              <input className={fieldClass} placeholder="EPC certificate document ID" value={profile.epc_certificate_document_id} onChange={(event) => setProfile((current) => ({ ...current, epc_certificate_document_id: event.target.value }))} />
            </div>
            <textarea className={fieldClass} rows={3} placeholder="Insulation notes" value={profile.insulation_notes} onChange={(event) => setProfile((current) => ({ ...current, insulation_notes: event.target.value }))} />
          </div>
        </Card>

        <Card className="!p-5">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Result panel</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 p-3"><p className="text-xs uppercase text-slate-500">Current</p><p className="font-semibold">EPC Band {impact.currentBand || "unknown"} {impact.currentScore ? `(${impact.currentScore})` : ""}</p></div>
            <div className="rounded-2xl border border-slate-200 p-3"><p className="text-xs uppercase text-slate-500">Target</p><p className="font-semibold">Planning target: Band {impact.targetBand}</p></div>
            <div className="rounded-2xl border border-slate-200 p-3"><p className="text-xs uppercase text-slate-500">Estimated gain</p><p className="font-semibold">+{impact.estimatedEpcPointsGain} points</p></div>
            <div className="rounded-2xl border border-slate-200 p-3"><p className="text-xs uppercase text-slate-500">Estimated result</p><p className="font-semibold">Band {impact.estimatedResultBand}, indicative only</p></div>
            <div className="rounded-2xl border border-slate-200 p-3"><p className="text-xs uppercase text-slate-500">Estimated cost</p><p className="font-semibold">{formatCurrencyAmount(impact.estimatedTotalCost, { currency: "GBP" })}</p></div>
            <div className="rounded-2xl border border-slate-200 p-3"><p className="text-xs uppercase text-slate-500">Target reached</p><p className="font-semibold">{impact.targetReached ? "Yes, indicative" : "Not yet"}</p></div>
          </div>
          <div className={`mt-3 rounded-2xl border p-3 text-sm ${riskTone(riskLevel)}`}>
            <p className="font-semibold">{riskCopy(riskLevel)}</p>
            <p className="mt-1 text-xs">{confidenceCopy(impact.confidence)}</p>
          </div>
          <p className="mt-3 text-xs text-slate-500">Indicative cost and EPC upgrade estimate only. Review with EPC assessor before making compliance or investment decisions.</p>
        </Card>
      </div>

      <Card className="!p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-3xl">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Suggested upgrades</h2>
            <p className="mt-1 text-sm text-slate-500">Selected upgrades update the total cost, points gain and result band.</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Indicative costs are static planning estimates from Tenaqo's seeded upgrade catalogue. They are not live quotes or web-searched prices.
            </p>
          </div>
          <button type="button" onClick={handleSavePlan} disabled={!activeAccountId || !effectivePropertyId} className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400">
            <Save size={16} /> Save plan
          </button>
        </div>
        {error ? <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[920px] table-fixed text-left text-sm">
            <colgroup>
              <col className="w-16" />
              <col className="w-72" />
              <col className="w-36" />
              <col className="w-36" />
              <col className="w-32" />
              <col className="w-56" />
              <col className="w-40" />
            </colgroup>
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2 pr-3">Selected</th>
                <th className="py-2 pr-3">Upgrade</th>
                <th className="py-2 pr-3">Indicative cost (editable)</th>
                <th className="py-2 pr-3">Estimated points</th>
                <th className="py-2 pr-3">Priority</th>
                <th className="py-2 pr-3">Notes</th>
                <th className="py-2 pr-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((item, index) => (
                <tr key={`${item.upgrade_key || item.id}-${index}`}>
                  <td className="py-3 pr-3"><input type="checkbox" checked={item.selected} onChange={(event) => updateItem(index, { selected: event.target.checked })} /></td>
                  <td className="py-3 pr-3"><p className="font-semibold">{item.label}</p><p className="text-xs text-slate-500">{item.description}</p></td>
                  <td className="py-3 pr-3"><input className={`${fieldClass} w-28`} type="number" value={item.estimated_cost || ""} onChange={(event) => updateItem(index, { estimated_cost: event.target.value })} /></td>
                  <td className="py-3 pr-3"><input className={`${fieldClass} w-24`} type="number" value={item.estimated_epc_points_gain || ""} onChange={(event) => updateItem(index, { estimated_epc_points_gain: event.target.value })} /></td>
                  <td className="py-3 pr-3"><select className={fieldClass} value={item.priority || "medium"} onChange={(event) => updateItem(index, { priority: event.target.value })}>{["low","medium","high"].map((priority) => <option key={priority}>{priority}</option>)}</select></td>
                  <td className="py-3 pr-3"><input className={fieldClass} value={item.notes || ""} onChange={(event) => updateItem(index, { notes: event.target.value })} /></td>
                  <td className="py-3 pr-3">
                    <button
                      type="button"
                      onClick={() => handleWorkOrderStub(item)}
                      disabled={!item.plan_item_id}
                      className="inline-flex min-w-32 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      <Hammer size={14} /> {item.plan_item_id ? "Prepare handoff" : "Save plan first"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="!p-5">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Plan summary</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 p-3"><p className="text-xs uppercase text-slate-500">Property</p><p className="font-semibold">{selectedProperty?.address || selectedProperty?.name || "Select a property"}</p></div>
          <div className="rounded-2xl border border-slate-200 p-3"><p className="text-xs uppercase text-slate-500">Selected plan cost</p><p className="font-semibold">{formatCurrencyAmount(totals.estimatedTotalCost, { currency: "GBP" })}</p></div>
          <div className="rounded-2xl border border-slate-200 p-3"><p className="text-xs uppercase text-slate-500">High priority upgrades</p><p className="font-semibold">{totals.highPriorityUpgrades}</p></div>
          <div className="rounded-2xl border border-slate-200 p-3"><p className="text-xs uppercase text-slate-500">Completed upgrades</p><p className="font-semibold">{totals.completedUpgrades}</p></div>
        </div>
      </Card>

      {plans.length ? <p className="text-xs text-slate-500">{plans.length} saved plan record(s) for this property.</p> : null}
    </div>
  );
}
