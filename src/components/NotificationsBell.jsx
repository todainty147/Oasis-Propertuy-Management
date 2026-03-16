// src/components/NotificationsBell.jsx
import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useNotifications } from "../hooks/useNotifications";
import { useI18n } from "../context/I18nContext";

function AlertBadge({ category, severity, t }) {
  const tone =
    severity === "urgent"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : severity === "action"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-slate-200 bg-slate-50 text-slate-600";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] ${tone}`}>
      {t(`notifications.category.${category}`)}
    </span>
  );
}

/**
 * Minimal bell dropdown
 * - unread badge
 * - list latest notifications
 * - click item => mark read + navigate (if link_path)
 * - mark all read
 */
export default function NotificationsBell({ limit = 20 }) {
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const { items, loading, unreadCount, markRead, markAllRead } =
    useNotifications({ limit });

  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    function onDown(e) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  async function handleClickNotification(n) {
    try {
      if (!n.is_read) await markRead(n.id);
    } catch (e) {
      console.warn("[notifications] markRead failed:", e);
    }

    setOpen(false);
    if (n.link_path) navigate(n.link_path);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex items-center justify-center w-10 h-10 rounded-lg hover:bg-slate-50 transition-colors"
        aria-label={t("notifications.label")}
      >
        <Bell className="w-5 h-5 text-slate-700" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-blue-600 text-white text-[11px] leading-[18px] text-center">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[360px] max-w-[90vw] bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-slate-900">
                {t("notifications.title")}
              </p>
              {unreadCount > 0 && (
                <span className="text-xs text-slate-500">
                  ({t("notifications.unread", { count: unreadCount })})
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={async () => {
                try {
                  await markAllRead();
                } catch (e) {
                  console.warn("[notifications] markAllRead failed:", e);
                }
              }}
              disabled={unreadCount === 0}
              className={`text-xs font-medium px-2 py-1 rounded-md transition-colors ${
                unreadCount === 0
                  ? "text-slate-400 cursor-not-allowed"
                  : "text-blue-600 hover:bg-blue-50"
              }`}
            >
              {t("notifications.markAllRead")}
            </button>
          </div>

          <div className="max-h-[420px] overflow-auto">
            {loading ? (
              <div className="p-4 text-sm text-slate-500">{t("notifications.loading")}</div>
            ) : items.length === 0 ? (
              <div className="p-4 text-sm text-slate-500">
                {t("notifications.empty")}
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => handleClickNotification(n)}
                      className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors ${
                        n.is_read ? "" : "bg-blue-50/40"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="mb-1">
                            <AlertBadge
                              category={n.alert_category || "general"}
                              severity={n.alert_severity || "info"}
                              t={t}
                            />
                          </div>
                          <p
                            className={`text-sm ${
                              n.is_read
                                ? "text-slate-800"
                                : "text-slate-900 font-semibold"
                            }`}
                          >
                            {n.title}
                          </p>
                          {n.body && (
                            <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                              {n.body}
                            </p>
                          )}
                          <p className="text-[11px] text-slate-400 mt-1">
                            {formatTime(n.created_at, lang)}
                          </p>
                        </div>

                        {!n.is_read && (
                          <span className="mt-1 w-2 h-2 rounded-full bg-blue-600 flex-shrink-0" />
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="px-4 py-3 border-t border-slate-100 bg-slate-50">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-full text-xs font-medium text-slate-700 hover:text-slate-900"
            >
              {t("common.close")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatTime(iso, lang = "pl") {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString(lang === "pl" ? "pl-PL" : "en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
