import { useEffect, useMemo, useState } from "react";

import { marketplaceProviders } from "../../config/marketplaceProviders";
import {
  createMarketplaceJob,
  getFulfilmentRoute,
  getMarketplaceJobsForWorkOrder,
  getMarketplaceProviders,
  getMarketplaceSuggestion,
  markMarketplaceJobSubmitted,
  setFulfilmentRoute,
  updateMarketplaceJobStatus,
} from "../../services/marketplaceIntegrationService";
import { buildMarketplaceHandoffCopy } from "../../utils/marketplaceHandoffCopy";

const STATUS_OPTIONS = [
  "draft",
  "ready_to_submit",
  "submitted",
  "acknowledged",
  "matched",
  "quote_received",
  "appointment_scheduled",
  "in_progress",
  "completed",
  "cancelled",
  "failed",
  "manual_follow_up",
];

const COPY = {
  en: {
    title: "Choose fulfilment route",
    subtitle: "Keep internal contractor assignment and external marketplace handoff as explicit, separate choices.",
    internal: "Assign to my contractor",
    marketplace: "Send to marketplace",
    hybrid: "Hybrid route active",
    undecided: "Not decided yet",
    currentRoute: "Current route",
    currentRouteLabel: {
      internal: "Assign to my contractor",
      marketplace: "Send to marketplace",
      hybrid: "Hybrid route active",
      undecided: "Not decided yet",
    },
    riskInternal:
      "This work order already has a marketplace handoff. Assigning an internal contractor may duplicate the job.",
    riskMarketplace:
      "This work order already has a contractor assigned. Sending it to a marketplace may duplicate the job.",
    riskConfirm: "I understand the duplication risk and want to continue.",
    panelTitle: "External marketplace handoff",
    panelSubtitle:
      "OASIS stays the source of truth. External marketplaces only receive a job handoff and whatever external reference you add back here.",
    unknownCountry: "Choose the marketplace that matches the property location.",
    suggested: "Suggested provider",
    provider: "Marketplace provider",
    tradeCategory: "Trade category",
    contactName: "Contact name",
    contactEmail: "Contact email",
    contactPhone: "Contact phone",
    consent:
      "I confirm this job and relevant contact/property details can be shared with the selected external marketplace.",
    create: "Create marketplace handoff",
    createBlockedByRisk: "Confirm the duplication warning before creating the marketplace handoff.",
    openProvider: "Open marketplace site",
    copy: "Copy handoff text",
    copied: "Handoff text copied.",
    extRef: "External reference",
    extUrl: "External URL",
    markSubmitted: "Mark as submitted",
    status: "Status",
    updateStatus: "Update status",
    noJobs: "No marketplace handoffs yet.",
    manualFixly: "Manual Fixly handoff prepared.",
    manualMyHammer: "Manual MyHammer handoff prepared.",
    manualCheckatrade: "Checkatrade API not configured. Manual handoff prepared.",
    draftNote: "Consent is required before contact details are included in marketplace handoff.",
    existingJobs: "Existing marketplace handoffs",
    chooseTrade: "e.g. plumbing, electrical, lock change",
    syncing: "Syncing marketplace state…",
    syncFailed: "Marketplace persistence is temporarily unavailable. Existing browser-local handoffs are still shown.",
  },
  pl: {
    title: "Wybierz ścieżkę realizacji",
    subtitle:
      "Przypisanie własnego wykonawcy i wysyłka na marketplace pozostają oddzielnymi, świadomymi decyzjami.",
    internal: "Przypisz mojego wykonawcę",
    marketplace: "Wyślij na marketplace",
    hybrid: "Aktywna ścieżka hybrydowa",
    undecided: "Jeszcze bez decyzji",
    currentRoute: "Bieżąca ścieżka",
    currentRouteLabel: {
      internal: "Przypisz mojego wykonawcę",
      marketplace: "Wyślij na marketplace",
      hybrid: "Aktywna ścieżka hybrydowa",
      undecided: "Jeszcze bez decyzji",
    },
    riskInternal:
      "To zlecenie ma już handoff marketplace. Przypisanie wewnętrznego wykonawcy może zdublować pracę.",
    riskMarketplace:
      "To zlecenie ma już przypisanego wykonawcę. Wysłanie na marketplace może zdublować pracę.",
    riskConfirm: "Rozumiem ryzyko duplikacji i chcę kontynuować.",
    panelTitle: "Handoff do zewnętrznego marketplace",
    panelSubtitle:
      "OASIS pozostaje źródłem prawdy. Marketplace dostaje tylko handoff zlecenia oraz zewnętrzne referencje, które wrócą tutaj.",
    unknownCountry: "Wybierz marketplace zgodny z lokalizacją nieruchomości.",
    suggested: "Sugerowany provider",
    provider: "Marketplace",
    tradeCategory: "Kategoria prac",
    contactName: "Imię i nazwisko kontaktowe",
    contactEmail: "E-mail kontaktowy",
    contactPhone: "Telefon kontaktowy",
    consent:
      "Potwierdzam, że to zlecenie i odpowiednie dane kontaktowe / dane nieruchomości mogą zostać udostępnione wybranemu marketplace.",
    create: "Utwórz handoff marketplace",
    createBlockedByRisk: "Potwierdź ostrzeżenie o duplikacji przed utworzeniem handoffu marketplace.",
    openProvider: "Otwórz stronę marketplace",
    copy: "Kopiuj tekst handoff",
    copied: "Tekst handoff skopiowany.",
    extRef: "Zewnętrzna referencja",
    extUrl: "Zewnętrzny URL",
    markSubmitted: "Oznacz jako wysłane",
    status: "Status",
    updateStatus: "Zaktualizuj status",
    noJobs: "Brak handoffów marketplace.",
    manualFixly: "Przygotowano ręczny handoff Fixly.",
    manualMyHammer: "Przygotowano ręczny handoff MyHammer.",
    manualCheckatrade: "API Checkatrade nie jest skonfigurowane. Przygotowano ręczny handoff.",
    draftNote: "Zgoda jest wymagana, zanim dane kontaktowe trafią do marketplace.",
    existingJobs: "Istniejące handoffy marketplace",
    chooseTrade: "np. hydraulika, elektryka, wymiana zamka",
    syncing: "Synchronizowanie stanu marketplace…",
    syncFailed: "Trwały zapis marketplace jest chwilowo niedostępny. Nadal pokazujemy istniejące lokalne handoffy przeglądarki.",
  },
};

function formatDateTime(value) {
  if (!value) return "—";
  const next = new Date(value);
  if (Number.isNaN(next.getTime())) return "—";
  return next.toLocaleString();
}

export default function ExternalMarketplacePanel({ accountId, workOrder, canManage = false, lang = "en" }) {
  const copy = COPY[lang] || COPY.en;
  const countryCode =
    workOrder?.country_code ||
    workOrder?.properties?.country_code ||
    workOrder?.maintenance_requests?.country_code ||
    "";
  const suggestedProvider = getMarketplaceSuggestion(countryCode);
  const providers = useMemo(() => getMarketplaceProviders(), []);
  const [route, setRoute] = useState("internal");
  const [jobs, setJobs] = useState([]);
  const [providerKey, setProviderKey] = useState(() => suggestedProvider || "checkatrade");
  const [tradeCategory, setTradeCategory] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false);
  const [externalMeta, setExternalMeta] = useState({});
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const hasInternalContractor = !!(workOrder?.contractor_name || workOrder?.contractor_user_id);
  const propertyLabel =
    [workOrder?.properties?.address, workOrder?.properties?.city].filter(Boolean).join(", ") ||
    workOrder?.maintenance_requests?.title ||
    "Property";

  const hasMarketplaceJobs = jobs.length > 0;
  const internalRouteConflict = hasMarketplaceJobs;
  const marketplaceRouteConflict = hasInternalContractor;
  const showInternalRisk = route === "internal" && internalRouteConflict;
  const showMarketplaceRisk = (route === "marketplace" || route === "hybrid") && marketplaceRouteConflict;

  useEffect(() => {
    let cancelled = false;

    async function loadMarketplaceState() {
      if (!accountId || !workOrder?.id) return;

      setIsSyncing(true);
      setSyncError("");

      try {
        const [nextRoute, nextJobs] = await Promise.all([
          getFulfilmentRoute({ accountId, workOrderId: workOrder.id }),
          getMarketplaceJobsForWorkOrder({ accountId, workOrderId: workOrder.id }),
        ]);

        if (cancelled) return;

        setRoute(nextRoute);
        setJobs(nextJobs);
      } catch (error) {
        if (cancelled) return;
        setSyncError(error?.message || copy.syncFailed);
      } finally {
        if (!cancelled) setIsSyncing(false);
      }
    }

    loadMarketplaceState();
    return () => {
      cancelled = true;
    };
  }, [accountId, workOrder?.id]);

  if (!canManage || !workOrder?.id) return null;

  async function refreshJobs() {
    const nextJobs = await getMarketplaceJobsForWorkOrder({ accountId, workOrderId: workOrder.id });
    setJobs(nextJobs);
  }

  async function persistRoute(nextRoute) {
    let persisted = nextRoute;
    if (nextRoute === "internal" && hasMarketplaceJobs) persisted = "hybrid";
    if (nextRoute === "marketplace" && hasInternalContractor) persisted = "hybrid";
    const saved = await setFulfilmentRoute({ accountId, workOrderId: workOrder.id, route: persisted });
    setRoute(saved);
  }

  function providerNotice(key) {
    if (key === "fixly") return copy.manualFixly;
    if (key === "myhammer") return copy.manualMyHammer;
    return copy.manualCheckatrade;
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 space-y-4">
      <div>
        <p className="font-semibold text-slate-900">{copy.title}</p>
        <p className="mt-1 text-xs text-slate-500">{copy.subtitle}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={async () => {
            try {
              setSyncError("");
              await persistRoute("internal");
            } catch (error) {
              setSyncError(error?.message || copy.syncFailed);
            }
          }}
          className={`rounded-lg border px-3 py-2 text-sm ${route === "internal" ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-300 hover:bg-slate-50"}`}
        >
          {copy.internal}
        </button>
        <button
          type="button"
          onClick={async () => {
            try {
              setSyncError("");
              await persistRoute("marketplace");
            } catch (error) {
              setSyncError(error?.message || copy.syncFailed);
            }
          }}
          className={`rounded-lg border px-3 py-2 text-sm ${route === "marketplace" || route === "hybrid" ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-300 hover:bg-slate-50"}`}
        >
          {copy.marketplace}
        </button>
        <button
          type="button"
          onClick={async () => {
            try {
              setSyncError("");
              await persistRoute("undecided");
            } catch (error) {
              setSyncError(error?.message || copy.syncFailed);
            }
          }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
        >
          {copy.undecided}
        </button>
      </div>

      {isSyncing ? <p className="text-xs text-slate-500">{copy.syncing}</p> : null}
      {syncError ? <p className="text-xs text-amber-700">{syncError}</p> : null}

      <p className="text-xs text-slate-500">
        {copy.currentRoute}:{" "}
        <span className="font-medium text-slate-700">
          {copy.currentRouteLabel?.[route] || route}
        </span>
      </p>

      {(showMarketplaceRisk || showInternalRisk) ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <p>{showMarketplaceRisk ? copy.riskMarketplace : copy.riskInternal}</p>
          <label className="mt-2 flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              checked={duplicateConfirmed}
              onChange={(event) => setDuplicateConfirmed(event.target.checked)}
              className="mt-0.5"
            />
            <span>{copy.riskConfirm}</span>
          </label>
        </div>
      ) : null}

      {(route === "marketplace" || route === "hybrid") ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
          <div>
            <p className="font-semibold text-slate-900">{copy.panelTitle}</p>
            <p className="mt-1 text-xs text-slate-500">{copy.panelSubtitle}</p>
          </div>

          {!suggestedProvider ? (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
              {copy.unknownCountry}
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              {copy.suggested}: <span className="font-medium text-slate-700">{marketplaceProviders[suggestedProvider]?.label}</span>
            </p>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm text-slate-700">
              <span className="mb-1 block text-xs text-slate-500">{copy.provider}</span>
              <select
                value={providerKey}
                onChange={(event) => setProviderKey(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                {providers.map((provider) => (
                  <option key={provider.providerKey} value={provider.providerKey}>
                    {provider.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm text-slate-700">
              <span className="mb-1 block text-xs text-slate-500">{copy.tradeCategory}</span>
              <input
                value={tradeCategory}
                onChange={(event) => setTradeCategory(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                placeholder={copy.chooseTrade}
              />
            </label>

            <label className="text-sm text-slate-700">
              <span className="mb-1 block text-xs text-slate-500">{copy.contactName}</span>
              <input
                value={contactName}
                onChange={(event) => setContactName(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>

            <label className="text-sm text-slate-700">
              <span className="mb-1 block text-xs text-slate-500">{copy.contactEmail}</span>
              <input
                value={contactEmail}
                onChange={(event) => setContactEmail(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>

            <label className="text-sm text-slate-700">
              <span className="mb-1 block text-xs text-slate-500">{copy.contactPhone}</span>
              <input
                value={contactPhone}
                onChange={(event) => setContactPhone(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
          </div>

          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={consentConfirmed}
              onChange={(event) => setConsentConfirmed(event.target.checked)}
              className="mt-0.5"
            />
            <span>{copy.consent}</span>
          </label>

          {!consentConfirmed ? <p className="text-xs text-amber-700">{copy.draftNote}</p> : null}
          {showMarketplaceRisk && !duplicateConfirmed ? (
            <p className="text-xs text-amber-700">{copy.createBlockedByRisk}</p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                try {
                  setSyncError("");
                  await createMarketplaceJob({
                    accountId,
                    workOrderId: workOrder.id,
                    providerKey,
                    tradeCategory,
                    contactName,
                    contactEmail,
                    contactPhone,
                    consentConfirmed,
                    title:
                      workOrder?.maintenance_requests?.title ||
                      workOrder?.notes?.slice(0, 80) ||
                      `Work order ${workOrder.id}`,
                    description: workOrder?.notes || workOrder?.maintenance_requests?.title || "",
                    urgency: workOrder?.status || "",
                    city: workOrder?.properties?.city || "",
                    propertyLabel,
                    requestPayload: { source: "oasis_marketplace_panel" },
                    metadata: { route },
                  });
                  await refreshJobs();
                  await persistRoute("marketplace");
                } catch (error) {
                  setSyncError(error?.message || copy.syncFailed);
                }
              }}
              disabled={showMarketplaceRisk && !duplicateConfirmed}
              className={`rounded-lg px-3 py-2 text-sm font-medium text-white ${
                showMarketplaceRisk && !duplicateConfirmed
                  ? "bg-slate-400 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {copy.create}
            </button>
            <span className="text-xs text-slate-500">{providerNotice(providerKey)}</span>
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-900">{copy.existingJobs}</p>
            {jobs.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">{copy.noJobs}</p>
            ) : (
              <div className="mt-3 space-y-3">
                {jobs.map((job) => {
                  const provider = marketplaceProviders[job.providerKey];
                  const handoffText = buildMarketplaceHandoffCopy(job, { locale: lang });
                  const extState = externalMeta[job.id] || {
                    externalReference: job.externalReference || "",
                    externalUrl: job.externalUrl || "",
                    status: job.status || "draft",
                  };
                  return (
                    <div key={job.id} className="rounded-lg border border-slate-200 bg-white p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{provider?.label || job.providerKey}</p>
                          <p className="text-xs text-slate-500">{job.tradeCategory || "—"} • {job.submissionMode}</p>
                        </div>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700">
                          {job.status}
                        </span>
                      </div>

                      <div className="mt-3 grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
                        <pre className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs whitespace-pre-wrap text-slate-700">
                          {handoffText}
                        </pre>

                        <div className="space-y-3">
                          <div className="flex flex-wrap gap-2">
                            <a
                              href={provider?.websiteUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
                            >
                              {copy.openProvider}
                            </a>
                            <button
                              type="button"
                              onClick={async () => {
                                await navigator.clipboard.writeText(handoffText);
                                window.alert(copy.copied);
                              }}
                              className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
                            >
                              {copy.copy}
                            </button>
                          </div>

                          <label className="block text-xs text-slate-500">
                            {copy.extRef}
                            <input
                              value={extState.externalReference}
                              onChange={(event) =>
                                setExternalMeta((prev) => ({
                                  ...prev,
                                  [job.id]: { ...extState, externalReference: event.target.value },
                                }))
                              }
                              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            />
                          </label>

                          <label className="block text-xs text-slate-500">
                            {copy.extUrl}
                            <input
                              value={extState.externalUrl}
                              onChange={(event) =>
                                setExternalMeta((prev) => ({
                                  ...prev,
                                  [job.id]: { ...extState, externalUrl: event.target.value },
                                }))
                              }
                              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            />
                          </label>

                          <label className="block text-xs text-slate-500">
                            {copy.status}
                            <select
                              value={extState.status}
                              onChange={(event) =>
                                setExternalMeta((prev) => ({
                                  ...prev,
                                  [job.id]: { ...extState, status: event.target.value },
                                }))
                              }
                              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            >
                              {STATUS_OPTIONS.map((status) => (
                                <option key={status} value={status}>
                                  {status}
                                </option>
                              ))}
                            </select>
                          </label>

                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  setSyncError("");
                                  await markMarketplaceJobSubmitted({
                                    accountId,
                                    marketplaceJobId: job.id,
                                    externalReference: extState.externalReference,
                                    externalUrl: extState.externalUrl,
                                    responsePayload: { source: "manual" },
                                  });
                                  await refreshJobs();
                                } catch (error) {
                                  setSyncError(error?.message || copy.syncFailed);
                                }
                              }}
                              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
                            >
                              {copy.markSubmitted}
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  setSyncError("");
                                  await updateMarketplaceJobStatus({
                                    accountId,
                                    marketplaceJobId: job.id,
                                    status: extState.status,
                                    payload: {
                                      externalReference: extState.externalReference,
                                      externalUrl: extState.externalUrl,
                                    },
                                  });
                                  await refreshJobs();
                                } catch (error) {
                                  setSyncError(error?.message || copy.syncFailed);
                                }
                              }}
                              className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
                            >
                              {copy.updateStatus}
                            </button>
                          </div>

                          <p className="text-xs text-slate-500">
                            {formatDateTime(job.submittedAt)} • {formatDateTime(job.updatedAt)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
