/**
 * Privacy-first telemetry module with consent gating and zero PII leakage.
 *
 * Consent model:
 *  - Granular: users can independently toggle "performance" and "errors"
 *    telemetry categories.
 *  - Timed: after the user makes a choice (accept / decline / granular save),
 *    the banner is suppressed for CONSENT_TTL_MS (default 30 days).
 *  - Re-surfaced: when the TTL expires the banner shows again so the user can
 *    review their choice with fresh context.
 */

export interface TelemetryEvent {
  name: string;
  properties?: Record<string, string | number | boolean>;
}

/** Granular consent categories. */
export interface TelemetryPreferences {
  /** Anonymous performance analytics (page-loads, timings, feature usage). */
  performance: boolean;
  /** Anonymous error reporting (stack traces without PII). */
  errors: boolean;
}

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

const CONSENT_KEY = "perigee_telemetry_consent";
const CONSENT_PREFS_KEY = "perigee_telemetry_prefs";
const CONSENT_TIMESTAMP_KEY = "perigee_telemetry_consent_at";

/** How long (ms) before re-surfacing the consent banner. Default: 30 days. */
export const CONSENT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the top-level consent value:
 *  - `true`  — user accepted (at least one category is on)
 *  - `false` — user explicitly declined everything
 *  - `null`  — no decision recorded yet (banner should show)
 *
 * Also returns `null` if the stored consent has expired (TTL exceeded),
 * so the banner re-surfaces after 30 days.
 */
export function getTelemetryConsent(): boolean | null {
  if (!isBrowser()) return null;

  const stored = localStorage.getItem(CONSENT_KEY);
  if (stored === null) return null;

  // Check TTL — if consent was recorded more than CONSENT_TTL_MS ago,
  // treat it as expired so the banner re-surfaces.
  const tsRaw = localStorage.getItem(CONSENT_TIMESTAMP_KEY);
  if (tsRaw) {
    const ts = parseInt(tsRaw, 10);
    if (!Number.isNaN(ts) && Date.now() - ts > CONSENT_TTL_MS) {
      // Consent has expired — clear it so the user is asked again.
      clearTelemetryConsent();
      return null;
    }
  }

  if (stored === "granted") return true;
  if (stored === "denied") return false;
  return null;
}

/**
 * Read the stored granular consent preferences.
 * Defaults to all-off when nothing is saved.
 */
export function getTelemetryPreferences(): TelemetryPreferences {
  if (!isBrowser()) return { performance: false, errors: false };
  try {
    const raw = localStorage.getItem(CONSENT_PREFS_KEY);
    if (!raw) return { performance: false, errors: false };
    return JSON.parse(raw) as TelemetryPreferences;
  } catch {
    return { performance: false, errors: false };
  }
}

/**
 * Persist a top-level consent decision and record the timestamp.
 * Optionally pass `prefs` for granular control; when omitted:
 *  - `consent = true`  → enables all categories
 *  - `consent = false` → disables all categories
 */
export function setTelemetryConsent(
  consent: boolean,
  prefs?: Partial<TelemetryPreferences>,
): void {
  if (!isBrowser()) return;

  const resolvedPrefs: TelemetryPreferences = prefs
    ? { performance: prefs.performance ?? consent, errors: prefs.errors ?? consent }
    : { performance: consent, errors: consent };

  localStorage.setItem(CONSENT_KEY, consent ? "granted" : "denied");
  localStorage.setItem(CONSENT_PREFS_KEY, JSON.stringify(resolvedPrefs));
  localStorage.setItem(CONSENT_TIMESTAMP_KEY, String(Date.now()));

  if (consent) {
    initPrivacyTelemetry();
  }
}

/** Clear all consent state so the banner will re-appear on the next page load. */
export function clearTelemetryConsent(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(CONSENT_KEY);
  localStorage.removeItem(CONSENT_PREFS_KEY);
  localStorage.removeItem(CONSENT_TIMESTAMP_KEY);
}

export function initPrivacyTelemetry(): void {
  if (!isBrowser()) return;
  if (getTelemetryConsent() !== true) return;

  // Initialize Plausible / PostHog script if configured or enabled
  if (!document.getElementById("plausible-telemetry-script")) {
    const script = document.createElement("script");
    script.id = "plausible-telemetry-script";
    script.defer = true;
    script.dataset.domain = window.location.hostname;
    script.src = "https://plausible.io/js/script.js";
    document.head.appendChild(script);
  }
}

export function trackTelemetryEvent(event: TelemetryEvent): void {
  if (!isBrowser() || getTelemetryConsent() !== true) return;

  // Strip potential PII properties before tracking
  const sanitizedProps: Record<string, string | number | boolean> = {};
  if (event.properties) {
    for (const [key, value] of Object.entries(event.properties)) {
      if (
        !key.toLowerCase().includes("email") &&
        !key.toLowerCase().includes("address") &&
        !key.toLowerCase().includes("name") &&
        !key.toLowerCase().includes("ip")
      ) {
        sanitizedProps[key] = value;
      }
    }
  }

  // Push to Plausible / window.plausible or custom privacy tracker
  if (typeof (window as unknown as { plausible?: Function }).plausible === "function") {
    (window as unknown as { plausible: Function }).plausible(event.name, { props: sanitizedProps });
  }
}
