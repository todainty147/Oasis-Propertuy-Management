import { useEffect, useMemo, useRef, useState } from "react";
import Card from "./Card";
import {
  archiveDocumentTemplate,
  fetchDocumentTemplates,
  getDocumentTemplatePreviewUrl,
  uploadDocumentTemplate,
} from "../services/documentTemplateService";

const COUNTRIES = [
  { value: "GB", labelKey: "documents.templates.country.GB" },
  { value: "PL", labelKey: "documents.templates.country.PL" },
];

const TEMPLATE_TYPES = [
  { value: "tenancy_agreement", labelKey: "documents.templates.type.tenancy_agreement" },
  { value: "contractor_assignment", labelKey: "documents.templates.type.contractor_assignment" },
  { value: "maintenance_access_consent", labelKey: "documents.templates.type.maintenance_access_consent" },
  { value: "deposit_checklist", labelKey: "documents.templates.type.deposit_checklist" },
  { value: "rent_receipt", labelKey: "documents.templates.type.rent_receipt" },
  { value: "guarantor_form", labelKey: "documents.templates.type.guarantor_form" },
  { value: "id_evidence", labelKey: "documents.templates.type.id_evidence" },
  { value: "compliance_notice", labelKey: "documents.templates.type.compliance_notice" },
  { value: "other", labelKey: "documents.templates.type.other" },
];

const LANGUAGES = [
  { value: "en", labelKey: "documents.templates.language.en" },
  { value: "pl", labelKey: "documents.templates.language.pl" },
];

function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
}

function isTemplateManager(role) {
  return ["owner", "admin", "root", "super-admin", "super_admin"].includes(normalizeRole(role));
}

function selectClasses(extra = "") {
  return `rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 ${extra}`;
}

function inputClasses(extra = "") {
  return `rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 ${extra}`;
}

export default function DocumentTemplateLibrary({ accountId, permissionContext, t }) {
  const role = permissionContext?.role;
  const canManage = isTemplateManager(role);
  const fileInputRef = useRef(null);

  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const [form, setForm] = useState({
    countryCode: "GB",
    language: "en",
    templateType: "tenancy_agreement",
    name: "",
    description: "",
  });

  const filteredTemplates = useMemo(() => templates, [templates]);

  async function loadTemplates() {
    if (!accountId) return;
    setLoading(true);
    setError("");
    try {
      const rows = await fetchDocumentTemplates({
        accountId,
        countryCode: countryFilter,
        templateType: typeFilter,
      });
      setTemplates(rows);
    } catch (err) {
      setError(err?.message || t("documents.templates.loadError"));
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, countryFilter, typeFilter]);

  function patchForm(patch) {
    setForm((current) => ({ ...current, ...patch }));
  }

  async function handleTemplateFileChange(event) {
    const file = event.target.files?.[0];
    if (!file || !accountId) return;

    setBusy(true);
    setError("");
    try {
      await uploadDocumentTemplate({
        file,
        accountId,
        ...form,
      });
      patchForm({ name: "", description: "" });
      await loadTemplates();
    } catch (err) {
      setError(err?.message || t("documents.templates.uploadError"));
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  async function handlePreview(template) {
    try {
      const url = await getDocumentTemplatePreviewUrl(template);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err?.message || t("documents.templates.previewError"));
    }
  }

  async function handleArchive(template) {
    if (!confirm(t("documents.templates.confirmArchive"))) return;
    setBusy(true);
    setError("");
    try {
      await archiveDocumentTemplate({ templateId: template.id, accountId });
      await loadTemplates();
    } catch (err) {
      setError(err?.message || t("documents.templates.archiveError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4 space-y-4" data-testid="document-template-library">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-300">
            {t("documents.templates.eyebrow")}
          </p>
          <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">
            {t("documents.templates.title")}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
            {t("documents.templates.subtitle")}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            value={countryFilter}
            onChange={(event) => setCountryFilter(event.target.value)}
            className={selectClasses()}
            aria-label={t("documents.templates.filterCountry")}
          >
            <option value="">{t("documents.templates.allCountries")}</option>
            {COUNTRIES.map((country) => (
              <option key={country.value} value={country.value}>
                {t(country.labelKey)}
              </option>
            ))}
          </select>

          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className={selectClasses()}
            aria-label={t("documents.templates.filterType")}
          >
            <option value="">{t("documents.templates.allTypes")}</option>
            {TEMPLATE_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {t(type.labelKey)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {canManage ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/60">
          <div className="grid gap-3 lg:grid-cols-[120px_120px_minmax(180px,240px)_minmax(220px,1fr)]">
            <select
              value={form.countryCode}
              onChange={(event) => patchForm({ countryCode: event.target.value })}
              className={selectClasses()}
              aria-label={t("documents.templates.country")}
            >
              {COUNTRIES.map((country) => (
                <option key={country.value} value={country.value}>
                  {t(country.labelKey)}
                </option>
              ))}
            </select>

            <select
              value={form.language}
              onChange={(event) => patchForm({ language: event.target.value })}
              className={selectClasses()}
              aria-label={t("documents.templates.language")}
            >
              {LANGUAGES.map((language) => (
                <option key={language.value} value={language.value}>
                  {t(language.labelKey)}
                </option>
              ))}
            </select>

            <select
              value={form.templateType}
              onChange={(event) => patchForm({ templateType: event.target.value })}
              className={selectClasses()}
              aria-label={t("documents.templates.type")}
            >
              {TEMPLATE_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {t(type.labelKey)}
                </option>
              ))}
            </select>

            <input
              value={form.name}
              onChange={(event) => patchForm({ name: event.target.value })}
              placeholder={t("documents.templates.namePlaceholder")}
              className={inputClasses()}
            />
          </div>

          <div className="mt-3 flex flex-col gap-3 lg:flex-row">
            <input
              value={form.description}
              onChange={(event) => patchForm({ description: event.target.value })}
              placeholder={t("documents.templates.descriptionPlaceholder")}
              className={inputClasses("flex-1")}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy || !form.name.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {busy ? t("attachments.uploading") : t("documents.templates.upload")}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
              onChange={handleTemplateFileChange}
            />
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">{t("common.loading")}</p>
      ) : filteredTemplates.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {t("documents.templates.empty")}
        </div>
      ) : (
        <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {filteredTemplates.map((template) => (
            <div
              key={template.id}
              className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-slate-950 dark:text-slate-50">{template.name}</p>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {template.country_code}
                  </span>
                  <span className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-950/50 dark:text-blue-200">
                    {t(`documents.templates.type.${template.template_type}`)}
                  </span>
                </div>
                {template.description ? (
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{template.description}</p>
                ) : null}
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {template.mime_type} • {(template.size_bytes / 1024).toFixed(1)} KB • v{template.version}
                </p>
              </div>

              <div className="flex flex-wrap gap-3 text-sm">
                <button
                  type="button"
                  onClick={() => handlePreview(template)}
                  className="text-blue-600 hover:underline dark:text-blue-300"
                >
                  {t("attachments.preview")}
                </button>
                {canManage ? (
                  <button
                    type="button"
                    onClick={() => handleArchive(template)}
                    disabled={busy}
                    className="text-red-600 hover:underline disabled:opacity-60 dark:text-red-300"
                  >
                    {t("documents.templates.archive")}
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
