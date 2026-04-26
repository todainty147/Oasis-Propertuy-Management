import { useEffect, useState } from "react";
import { useI18n } from "../../context/I18nContext";
import { getContractorRecommendation } from "../../services/contractorRecommendationService";
import { formatAttentionInsightTimestamp } from "../../services/attentionInsightService";

function toIsoOrNull(v) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export default function CreateWorkOrderDrawer({
  open,
  request = null,
  accountId = "",
  contractors = [],
  saving = false,
  onClose,
  onSubmit,
}) {
  const { t } = useI18n();
  const [contractorId, setContractorId] = useState("");
  const [contractorName, setContractorName] = useState("");
  const [contractorPhone, setContractorPhone] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [notes, setNotes] = useState("");
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [recommendationError, setRecommendationError] = useState("");
  const [recommendation, setRecommendation] = useState(null);

  useEffect(() => {
    if (!open) return;
    setContractorId("");
    setContractorName("");
    setContractorPhone("");
    setScheduledAt("");
    setNotes(request?.description ? `Zgłoszenie: ${request.description}` : "");
    setRecommendation(null);
    setRecommendationError("");
    setRecommendationLoading(false);
  }, [open, request]);

  useEffect(() => {
    if (!contractorId) return;
    const c = (contractors || []).find((x) => x.id === contractorId);
    setContractorName(c?.name || "");
    setContractorPhone(c?.phone || "");
  }, [contractorId, contractors]);

  useEffect(() => {
    let dead = false;

    async function loadRecommendation(forceRefresh = false) {
      if (!open || !accountId || !request?.id) return;
      setRecommendationLoading(true);
      setRecommendationError("");
      try {
        const nextInsight = await getContractorRecommendation({
          accountId,
          requestId: request.id,
          forceRefresh,
        });
        if (!dead) setRecommendation(nextInsight);
      } catch (error) {
        if (!dead) setRecommendationError(error?.message || t("maintenance.drawer.ai.loadError"));
      } finally {
        if (!dead) setRecommendationLoading(false);
      }
    }

    if (open && accountId && request?.id) {
      loadRecommendation(false);
    }

    return () => {
      dead = true;
    };
  }, [open, accountId, request?.id, t]);

  if (!open || !request) return null;

  const recommendedContractor = recommendation?.recommendedContractorId
    ? (contractors || []).find((row) => row.id === recommendation.recommendedContractorId)
    : null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={saving ? undefined : onClose} />
      <div className="absolute right-0 top-0 h-full w-[96vw] max-w-xl bg-white border-l shadow-xl p-4 overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">{t("maintenance.drawer.create")}</h3>
            <p className="text-sm text-slate-500 mt-1">{request.title || t("maintenance.drawer.requestWithoutTitle")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-sm px-2 py-1 rounded border hover:bg-slate-50 disabled:opacity-50"
          >
            {t("common.close")}
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-cyan-200 bg-cyan-50/40 p-3 space-y-3" data-testid="contractor-recommendation-card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-700">
                    {t("maintenance.drawer.ai.eyebrow")}
                  </span>
                  <span className="inline-flex rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600">
                    {t("maintenance.drawer.ai.scope.singleRequest")}
                  </span>
                  {recommendation ? (
                    <>
                      <span className="inline-flex rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600">
                        {recommendation.source === "openai"
                          ? t("maintenance.drawer.ai.source.openai")
                          : t("maintenance.drawer.ai.source.fallback")}
                      </span>
                      <span className="inline-flex rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600">
                        {t(`maintenance.drawer.ai.confidence.${recommendation.confidence}`)}
                      </span>
                    </>
                  ) : null}
                </div>
                <h4 className="mt-2 text-sm font-semibold text-slate-900">{t("maintenance.drawer.ai.title")}</h4>
                <p className="mt-1 text-xs text-slate-500">{t("maintenance.drawer.ai.subtitle")}</p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  setRecommendationLoading(true);
                  setRecommendationError("");
                  try {
                    const nextInsight = await getContractorRecommendation({
                      accountId,
                      requestId: request.id,
                      forceRefresh: true,
                    });
                    setRecommendation(nextInsight);
                  } catch (error) {
                    setRecommendationError(error?.message || t("maintenance.drawer.ai.loadError"));
                  } finally {
                    setRecommendationLoading(false);
                  }
                }}
                disabled={recommendationLoading}
                className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                {t("maintenance.drawer.ai.refresh")}
              </button>
            </div>

            {recommendationLoading && !recommendation ? (
              <p className="text-sm text-slate-500">{t("common.loading")}</p>
            ) : null}

            {recommendationError && !recommendation ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {recommendationError}
              </div>
            ) : null}

            {recommendation ? (
              <>
                <div className="grid gap-3 xl:grid-cols-[1fr_0.95fr]">
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {t("maintenance.drawer.ai.summary")}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {recommendation.recommendedContractorName || t("maintenance.drawer.ai.noClearMatch")}
                    </p>
                    <p className="mt-2 text-sm text-slate-700">{recommendation.reason}</p>
                    {recommendation.generatedAt ? (
                      <p className="mt-2 text-xs text-slate-500">
                        {t("maintenance.drawer.ai.generatedAt", {
                          value: formatAttentionInsightTimestamp(recommendation.generatedAt),
                        })}
                      </p>
                    ) : null}
                    {recommendedContractor ? (
                      <button
                        type="button"
                        onClick={() => setContractorId(recommendedContractor.id)}
                        className="mt-3 inline-flex items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                      >
                        {t("maintenance.drawer.ai.useRecommendation")}
                      </button>
                    ) : null}
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {t("maintenance.drawer.ai.facts")}
                    </p>
                    <ul className="mt-2 space-y-2 text-sm text-slate-700">
                      {(recommendation.factsUsed || []).map((fact) => (
                        <li key={fact} className="flex gap-2">
                          <span className="text-slate-400">•</span>
                          <span>{fact}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {recommendation.missingDataWarning ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    {recommendation.missingDataWarning}
                  </div>
                ) : null}

                {(recommendation.alternatives || []).length > 0 ? (
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {t("maintenance.drawer.ai.alternatives")}
                    </p>
                    <div className="mt-2 space-y-2">
                      {recommendation.alternatives.map((entry) => (
                        <div key={entry.contractorId} className="rounded-lg border border-slate-200 px-3 py-2">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-medium text-slate-900">{entry.contractorName}</p>
                            <button
                              type="button"
                              onClick={() => setContractorId(entry.contractorId)}
                              className="text-xs rounded-lg border border-slate-300 px-2.5 py-1.5 text-slate-700 hover:bg-slate-50"
                            >
                              {t("maintenance.drawer.ai.useAlternative")}
                            </button>
                          </div>
                          <p className="mt-1 text-xs text-slate-600">{entry.reason}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>

          <div>
            <label className="text-xs text-slate-500">{t("maintenance.drawer.contractorFromList")}</label>
            <select
              value={contractorId}
              onChange={(e) => setContractorId(e.target.value)}
              disabled={saving}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white disabled:bg-slate-50"
            >
              <option value="">{t("maintenance.drawer.unassigned")}</option>
              {(contractors || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500">{t("maintenance.drawer.contractorName")}</label>
              <input
                value={contractorName}
                onChange={(e) => setContractorName(e.target.value)}
                disabled={saving}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm disabled:bg-slate-50"
                placeholder={t("maintenance.drawer.optional")}
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">{t("maintenance.drawer.contractorPhone")}</label>
              <input
                value={contractorPhone}
                onChange={(e) => setContractorPhone(e.target.value)}
                disabled={saving}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm disabled:bg-slate-50"
                placeholder={t("maintenance.drawer.optional")}
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-500">{t("maintenance.drawer.scheduleOptional")}</label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              disabled={saving}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm disabled:bg-slate-50"
            />
          </div>

          <div>
            <label className="text-xs text-slate-500">{t("maintenance.drawer.notes")}</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={saving}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm min-h-[130px] disabled:bg-slate-50"
              placeholder={t("maintenance.drawer.optional")}
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-3 py-2 text-sm rounded-lg border hover:bg-slate-50 disabled:opacity-50"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={() =>
              onSubmit({
                contractorId: contractorId || null,
                contractorName: contractorName || null,
                contractorPhone: contractorPhone || null,
                scheduledAt: toIsoOrNull(scheduledAt),
                notes: notes || null,
              })
            }
            disabled={saving}
            className={`px-3 py-2 text-sm rounded-lg text-white ${
              saving ? "bg-slate-400" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {saving ? t("maintenance.drawer.saving") : t("maintenance.drawer.create")}
          </button>
        </div>
      </div>
    </div>
  );
}
