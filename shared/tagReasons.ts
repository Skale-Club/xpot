// Xpot Tags — reasons the server writes on its own (a destination history row,
// a stock movement) are stored as codes, `auto:<code>`, and worded by the app
// in the reader's language (components/piece/reasonText.ts). Reasons people
// type are stored and shown as typed. Pure, no I/O.

export const TAG_SYSTEM_REASONS = [
  /** A destination set while configuring the piece in the field app. */
  "configured_field",
  /** A destination changed from the customer page. */
  "changed_field",
  /** The piece moved to another customer, so its destination was cleared. */
  "reassigned",
  /** The customer was removed from the piece (back to unconfigured stock). */
  "unlinked",
  /** A cancelled sale gave the piece back to stock. */
  "sale_cancelled",
  /** The intake station undid a read. */
  "intake_undone",
] as const;
export type TagSystemReason = (typeof TAG_SYSTEM_REASONS)[number];

const PREFIX = "auto:";

/** The stored form of a system reason. */
export function tagSystemReason(code: TagSystemReason): string {
  return `${PREFIX}${code}`;
}

// The English defaults stored before the codes, still on older rows.
export const LEGACY_TAG_REASONS: Record<string, TagSystemReason> = {
  "Configured in the field app": "configured_field",
  "Changed from the customer page (field app)": "changed_field",
  "Re-assigned to another customer (field app)": "reassigned",
  "Re-assigned to another customer": "reassigned",
  "Unlinked from the customer page": "unlinked",
  Unassigned: "unlinked",
  "Sale cancelled": "sale_cancelled",
  "intake undone": "intake_undone",
};

/** The system reason a stored reason stands for, or null for a reason a person typed (or none). */
export function systemReasonOf(reason: string | null | undefined): TagSystemReason | null {
  if (!reason) return null;
  if (reason.startsWith(PREFIX)) {
    const code = reason.slice(PREFIX.length);
    return (TAG_SYSTEM_REASONS as readonly string[]).includes(code) ? (code as TagSystemReason) : null;
  }
  return LEGACY_TAG_REASONS[reason] ?? null;
}
