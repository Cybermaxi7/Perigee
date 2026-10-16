"use client";

/**
 * Analytics consent banner with:
 *  - 30-day TTL persistence — the banner only re-surfaces when the stored
 *    consent has expired (configurable via CONSENT_TTL_MS in telemetry.ts).
 *  - "Manage preferences" — lets users toggle individual analytics categories
 *    (performance analytics, error reporting) independently.
 *  - Fully i18n-ready — all strings are sourced from next-intl message keys.
 *
 * Resolves WEB-analytics (#task-4): consent banner always re-shown; no
 * granular preference control.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  getTelemetryConsent,
  getTelemetryPreferences,
  setTelemetryConsent,
  initPrivacyTelemetry,
  type TelemetryPreferences,
} from "../lib/telemetry";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AnalyticsBanner() {
  const t = useTranslations();

  // Banner visibility state
  const [showBanner, setShowBanner] = useState(false);
  // Whether the detailed "manage preferences" panel is open
  const [showPreferences, setShowPreferences] = useState(false);

  // Granular preference toggles (populated from storage or defaults)
  const [prefs, setPrefs] = useState<TelemetryPreferences>({
    performance: false,
    errors: false,
  });

  useEffect(() => {
    const consent = getTelemetryConsent();
    if (consent === null) {
      // No stored decision or it has expired — show the banner
      const stored = getTelemetryPreferences();
      setPrefs(stored);
      setShowBanner(true);
    } else if (consent === true) {
      // Previously accepted — initialise the telemetry script immediately
      initPrivacyTelemetry();
    }
    // consent === false → user declined, do nothing (banner stays hidden)
  }, []);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleAccept() {
    setTelemetryConsent(true);
    setShowBanner(false);
    setShowPreferences(false);
  }

  function handleDecline() {
    setTelemetryConsent(false);
    setShowBanner(false);
    setShowPreferences(false);
  }

  function handleSavePreferences() {
    const anyEnabled = prefs.performance || prefs.errors;
    setTelemetryConsent(anyEnabled, prefs);
    setShowBanner(false);
    setShowPreferences(false);
  }

  function handleTogglePref(key: keyof TelemetryPreferences) {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!showBanner) return null;

  return (
    <>
      {/* ── Consent Banner ─────────────────────────────────────────────────── */}
      {!showPreferences && (
        <aside
          aria-label={t("analytics.bannerAriaLabel")}
          role="dialog"
          aria-modal="false"
          className="fixed bottom-4 right-4 z-50 max-w-sm rounded-xl border border-slate-800 bg-slate-900/95 p-4 shadow-xl text-slate-200 text-xs backdrop-blur"
        >
          <p className="font-semibold text-slate-100 mb-1">
            {t("analytics.title")}
          </p>
          <p className="text-slate-400 mb-3">{t("analytics.description")}</p>

          <div className="flex items-center justify-between gap-2">
            {/* Manage preferences link */}
            <button
              type="button"
              onClick={() => setShowPreferences(true)}
              className="text-cyan-400 underline underline-offset-2 hover:text-cyan-300 transition-colors"
            >
              {t("analytics.managePreferences")}
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDecline}
                className="rounded px-3 py-1.5 border border-slate-700 hover:bg-slate-800 text-slate-300 transition-colors"
              >
                {t("analytics.decline")}
              </button>
              <button
                type="button"
                onClick={handleAccept}
                className="rounded px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 font-medium text-white transition-colors"
              >
                {t("analytics.accept")}
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* ── Manage Preferences Panel ────────────────────────────────────────── */}
      {showPreferences && (
        <aside
          aria-label={t("analytics.preferencesAriaLabel")}
          role="dialog"
          aria-modal="false"
          className="fixed bottom-4 right-4 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-800 bg-slate-900/95 p-4 shadow-xl text-slate-200 text-xs backdrop-blur"
        >
          <p className="font-semibold text-slate-100 mb-1">
            {t("analytics.preferencesTitle")}
          </p>
          <p className="text-slate-400 mb-4">{t("analytics.preferencesBody")}</p>

          {/* Performance toggle */}
          <label className="flex items-start gap-3 mb-3 cursor-pointer">
            <input
              type="checkbox"
              checked={prefs.performance}
              onChange={() => handleTogglePref("performance")}
              className="mt-0.5 h-3.5 w-3.5 rounded accent-cyan-500"
            />
            <span>
              <span className="font-medium text-slate-100 block">
                {t("analytics.consentPerformance")}
              </span>
              <span className="text-slate-400">
                {t("analytics.consentPerformanceDesc")}
              </span>
            </span>
          </label>

          {/* Error reporting toggle */}
          <label className="flex items-start gap-3 mb-4 cursor-pointer">
            <input
              type="checkbox"
              checked={prefs.errors}
              onChange={() => handleTogglePref("errors")}
              className="mt-0.5 h-3.5 w-3.5 rounded accent-cyan-500"
            />
            <span>
              <span className="font-medium text-slate-100 block">
                {t("analytics.consentErrors")}
              </span>
              <span className="text-slate-400">
                {t("analytics.consentErrorsDesc")}
              </span>
            </span>
          </label>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowPreferences(false)}
              className="rounded px-3 py-1.5 border border-slate-700 hover:bg-slate-800 text-slate-300 transition-colors"
            >
              {t("analytics.cancel")}
            </button>
            <button
              type="button"
              onClick={handleSavePreferences}
              className="rounded px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 font-medium text-white transition-colors"
            >
              {t("analytics.savePreferences")}
            </button>
          </div>
        </aside>
      )}
    </>
  );
}
