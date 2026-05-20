import { useState } from "react";
import { ExternalLink, Phone, Mail, MapPinned } from "lucide-react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function InlineField({ label, value, onSave, large, linkable, linkHref, validate }: {
  label: string;
  value: string;
  onSave: (v: string) => void;
  large?: boolean;
  linkable?: boolean;
  linkHref?: string;
  validate?: (v: string) => string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value);
  const [error, setError] = useState<string | null>(null);

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
    <div className="relative group py-1.5 rounded-xl">
      {label ? (
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">{label}</span>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          {editing ? (
            <div>
              <input
                autoFocus
                value={local}
                onChange={(e) => { setLocal(e.target.value); if (error) setError(null); }}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commit();
                  if (e.key === "Escape") { setLocal(value); setEditing(false); setError(null); }
                }}
                className={`w-full rounded-xl px-2 py-1 text-white outline-none ${large ? "text-xl font-bold" : "text-sm"}`}
                style={{
                  background: error ? "rgba(239,68,68,0.12)" : "rgba(99,102,241,0.15)",
                  border: `1px solid ${error ? "rgba(239,68,68,0.5)" : "rgba(99,102,241,0.4)"}`,
                }}
              />
              {error && (
                <div className="mt-1 text-[10px] font-medium text-red-400">{error}</div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className={`w-full text-left text-white/80 block ${large ? "text-xl font-bold leading-tight" : "text-sm break-all"}`}
            >
              {value || <span className="text-white/20 italic">—</span>}
            </button>
          )}
        </div>

        {linkable && value && !editing && (
          <a
            href={resolvedHref}
            target={linkHref?.startsWith("tel:") || linkHref?.startsWith("mailto:") ? undefined : "_blank"}
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex shrink-0 items-center justify-center h-8 w-8 rounded-full bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-all opacity-70 hover:opacity-100"
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
  return EMAIL_RE.test(v) ? null : "Invalid email address";
}
