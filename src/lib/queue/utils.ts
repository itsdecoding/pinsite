/**
 * Shared utility functions for Dials Queue, Caller Cockpit, and Team Center
 */

/**
 * Set of call outcomes representing a verified human connect.
 * Standardized across Caller Cockpit, Desktop Queue, and Team Center.
 */
export const HUMAN_CONNECT_OUTCOMES: ReadonlySet<string> = new Set([
  "interested",
  "callback",
  "gatekeeper",
  "dm_reached",
  "closed_won",
]);

/**
 * Formats a phone number for clean UI display.
 * Strips non-digits and formats Indian 10-digit numbers as +91 XXXXX XXXXX.
 * Handles 10-digit, 11-digit (leading 0), and 12-digit (91-prefixed) formats.
 */
export function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone || !phone.trim()) return "No Phone";
  const cleaned = phone.trim().replace(/\D/g, "");
  if (!cleaned) return "No Phone";
  let core10 = cleaned;
  if (cleaned.length === 11 && cleaned.startsWith("0")) core10 = cleaned.slice(1);
  else if (cleaned.length === 12 && cleaned.startsWith("91")) core10 = cleaned.slice(2);
  if (core10.length === 10) return `+91 ${core10.slice(0, 5)} ${core10.slice(5)}`;
  return phone.trim();
}

/**
 * Formats a phone number into a clickable `tel:` URI.
 */
export function formatTelLink(phone: string | null | undefined): string {
  if (!phone) return "";
  const cleaned = phone.trim().replace(/\D/g, "");
  if (!cleaned) return "";
  let core10 = cleaned;
  if (cleaned.length === 11 && cleaned.startsWith("0")) core10 = cleaned.slice(1);
  else if (cleaned.length === 12 && cleaned.startsWith("91")) core10 = cleaned.slice(2);
  if (core10.length === 10) return `tel:+91${core10}`;
  return `tel:+91${cleaned}`;
}

/**
 * Strips trailing branch descriptors or parenthetical clutter from business/lead names,
 * and formats medical doctor prefixes cleanly.
 */
export function formatLeadName(rawName: string | null | undefined): string {
  if (!rawName || !rawName.trim()) return "Unnamed Lead";
  let cleaned = rawName.trim().replace(/\s*(\(|\[|\bBranch\b|\bOutlet\b).*$/i, "");
  cleaned = cleaned.replace(/([a-zA-Z0-9'’])\s*-\s*([a-zA-Z0-9])/g, "$1 - $2");
  cleaned = cleaned.replace(/\bDr\.([A-Za-z])/gi, "Dr. $1");
  cleaned = cleaned.replace(/\bDr(?!\.)\s+/gi, "Dr. ");
  return cleaned.replace(/\s+/g, " ").trim() || "Unnamed Lead";
}

/**
 * Infers or returns the target decision maker title based on lead metadata and niche:
 * 1. Explicit decision_maker field if present
 * 2. Dr. name match from lead title
 * 3. Niche-based contextual title (Doctor, Gym Owner, General Manager, Salon Owner)
 * 4. Fallback to owner title
 */
export function resolveDecisionMaker(
  lead: { decision_maker?: string | null; niche?: string | null; name?: string | null } | null | undefined
): string {
  if (!lead) return "Decision Maker / Owner";
  if (lead.decision_maker && lead.decision_maker.trim()) {
    return lead.decision_maker.trim();
  }
  const match = (lead.name || "").match(/^(Dr\.?\s*[A-Za-z]+('s)?)/i);
  if (match) {
    const docName = match[1].replace(/'s$/i, "").replace(/^Dr\.?\s*/i, "Dr. ");
    return `${docName.trim()} (Owner)`;
  }
  const niche = (lead.niche || "").toLowerCase();
  if (niche.includes("dental") || niche.includes("clinic") || niche.includes("health")) {
    return "Doctor / Clinic Owner";
  }
  if (niche.includes("gym") || niche.includes("fitness")) {
    return "Gym Owner / Head Coach";
  }
  if (niche.includes("restaurant") || niche.includes("cafe") || niche.includes("bakery")) {
    return "General Manager / Owner";
  }
  if (niche.includes("salon") || niche.includes("spa")) {
    return "Salon Owner / Director";
  }
  return "Decision Maker / Owner";
}

/**
 * Formats an ISO date string into human-readable relative time (e.g. 'Just now', '5m ago', 'Yesterday', or future '3h', 'Tomorrow').
 */
export function formatRelativeTime(dateString: string | null | undefined): string {
  if (!dateString) return "Never";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "Recently";
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();

    // Future timestamp (e.g. cooldown_until or next_callback_at)
    if (diffMs < 0) {
      const futureSec = Math.round(-diffMs / 1000);
      if (futureSec < 60) return "Soon";
      if (futureSec < 3600) return `${Math.floor(futureSec / 60)}m`;
      if (futureSec < 86400) return `${Math.floor(futureSec / 3600)}h`;
      if (futureSec < 172800) return "Tomorrow";
      return `${Math.floor(futureSec / 86400)}d`;
    }

    const diffSec = Math.round(diffMs / 1000);
    if (diffSec < 60) return "Just now";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    if (diffSec < 172800) return "Yesterday";
    const diffDays = Math.floor(diffSec / 86400);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
  } catch {
    return "Recently";
  }
}

/**
 * Computes the start of the current day in Asia/Kolkata (IST: UTC+5:30) as an ISO UTC string.
 */
export function getISTStartOfDayUtcIso(referenceDate: Date = new Date()): string {
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(referenceDate.getTime() + istOffsetMs);
  const istYear = istNow.getUTCFullYear();
  const istMonth = istNow.getUTCMonth();
  const istDate = istNow.getUTCDate();
  return new Date(Date.UTC(istYear, istMonth, istDate) - istOffsetMs).toISOString();
}

/**
 * Cleanly truncates a string at word boundary without awkward cutoffs.
 */
export function cleanTruncateAtWord(text: string | null | undefined, maxChars = 28): string {
  if (!text) return "";
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  const sub = trimmed.slice(0, maxChars);
  const lastSpace = sub.lastIndexOf(" ");
  const cleanSub = lastSpace > 10 ? sub.slice(0, lastSpace) : sub;
  return cleanSub.replace(/[,.-]+$/, "") + "...";
}
