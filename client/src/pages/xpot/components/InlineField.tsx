import { useEffect, useState } from "react";
import { ExternalLink, Phone, Mail, MapPinned } from "lucide-react";
import { translate } from "@/i18n";
import { leadsMessages } from "@/i18n/messages/leads";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function InlineField({ label, value, onSave, large, linkable, linkHref, linkLabel, validate, formatInput, display, inputMode }: {
  label: string;
  value: string;
  onSave: (v: string) => void;
  large?: boolean;
  linkable?: boolean;
  linkHref?: string;
  /** Screen-reader name of the link button ("Call", "Directions"); defaults to the label. */
  linkLabel?: string;
  validate?: (v: string) => string | null;
  /** Reformats the text as it is typed (the phone mask). */
  formatInput?: (v: string) => string;
  /** How the saved value reads when not editing (a formatted phone). */
  display?: (v: string) => string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) setLocal(value);
  }, [editing, value]);

  function commit() {
    if (validate) {
      const msg = validate(local);
      if (msg) { setError(msg); return; }
    }
    setError(null);
    setEditing(false);
    if (local !== value) onSave(local);
  }

  function getLinkIcon() {
    if (!linkHref) return <ExternalLink size={16} />;
    if (linkHref.startsWith("tel:")) return <Phone size={16} />;
    if (linkHref.startsWith("mailto:")) return <Mail size={16} />;
    if (linkHref.includes("maps.google.com")) return <MapPinned size={16} />;
    return <ExternalLink size={16} />;
  }

  const resolvedHref = linkHref ?? (value.startsWith("http") ? value : `https://${value}`);

  return (
    // Nothing about a bare line of text says "tap me to edit" — the hover tint
    // and the wider hit area do.
    <div className="relative group -mx-2 px-2 py-1.5 rounded-xl transition-colors hover:bg-white/[0.04]">
      {label ? (
        <div className="mb-0.5 flex items-center gap-1.5">
          <span className="text-xs font-semibold text-white/60">{label}</span>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          {editing ? (
            <div>
              <input
                autoFocus
                value={local}
                inputMode={inputMode}
                aria-label={label || undefined}
                onChange={(e) => { setLocal(formatInput ? formatInput(e.target.value) : e.target.value); if (error) setError(null); }}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commit();
                  if (e.key === "Escape") { setLocal(value); setEditing(false); setError(null); }
                }}
                className={`w-full rounded-xl border px-2 py-1 text-white outline-none ${error ? "border-red-400/50 bg-red-500/[0.12]" : "border-blue-400/40 bg-blue-500/[0.12]"} ${large ? "text-xl font-bold" : "text-base sm:text-sm"}`}
              />
              {error && (
                <div className="mt-1 text-xs text-red-300">{error}</div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label={label || undefined}
              className={`block min-h-8 w-full text-left text-white/80 ${large ? "text-xl font-bold leading-tight" : "text-sm break-all"}`}
            >
              {value ? (display ? display(value) : value) : <span className="text-white/20 italic">—</span>}
            </button>
          )}
        </div>

        {linkable && value && !editing && (
          <a
            href={resolvedHref}
            target={linkHref?.startsWith("tel:") || linkHref?.startsWith("mailto:") ? undefined : "_blank"}
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            aria-label={linkLabel ?? label}
            title={linkLabel ?? label}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.05] text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            {getLinkIcon()}
          </a>
        )}
      </div>
    </div>
  );
}

export function validateEmail(v: string): string | null {
  if (!v) return null; // campo vazio é permitido
  return EMAIL_RE.test(v) ? null : translate(leadsMessages, "invalidEmail");
}
