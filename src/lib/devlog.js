/**
 * Structured API logging for the onboarding flow.
 *
 * Logs are safe-by-default: they only carry operational metadata — request id,
 * endpoint, HTTP status, outcome classification — never authorization tokens,
 * passwords, keys, or user message contents.
 */
const GROUP_STYLE = "color:#b45309;font-weight:bold";

function baseInfo(event) {
  return {
    time: new Date().toISOString(),
    event,
  };
}

/** logApi("discovery.request", { requestId, endpoint, attempt: 2, ... }) */
export function logApi(event, data = {}) {
  try {
    const info = { ...baseInfo(event), ...data };
    if (typeof console !== "undefined" && console.info) {
      console.groupCollapsed(`%c[zeus-api] ${event}`, GROUP_STYLE);
      console.log(JSON.stringify(info, null, 0));
      console.groupEnd();
    }
  } catch {
    /* logging must never break the flow */
  }
}

/** Classify an exception thrown by the API client (never its payload text). */
export function classifyError(error) {
  if (!error) return { kind: "unknown", phase: "api" };
  if (error.isTimeout) return { kind: "timeout", phase: "network" };
  if (error.status === 401) return { kind: "auth_expired", phase: "api" };
  if (error.status === 429) return { kind: "rate_limited", phase: "api" };
  if (error.status) return { kind: `http_${error.status}`, phase: "api" };
  if (error.name === "TypeError") return { kind: "network", phase: "network" };
  return { kind: error.name || "unknown", phase: "api" };
}

/**
 * Distinguish genuine failures from "consumed but not delivered" cases.
 * A response counts as USABLE only when the client could not parse/display it
 * — not when the server had already produced a valid answer.
 */
export function responseQuality(data) {
  if (!data || typeof data !== "object") return { ok: false, reason: "empty_response" };
  if (typeof data.reply !== "string") return { ok: false, reason: "unparsed_response" };
  if (!data.reply.trim() && !data.isComplete && !data.pending && !data.credit_exhausted) {
    return { ok: false, reason: "empty_reply" };
  }
  return { ok: true, reason: "ok" };
}
