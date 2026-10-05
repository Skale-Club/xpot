import type { CSSProperties, ReactNode } from "react";
import { CalendarCheck, Contact, Facebook, Globe, Instagram, Linkedin, Mail, Phone, Sparkles, Tag, UtensilsCrossed, Youtube } from "lucide-react";
import { isTagFace, type TagFace } from "@shared/tagFace";
import { useT } from "@/i18n";
import { tagsMessages } from "@/i18n/messages/tags";
import { GoogleLogo } from "@/components/ui/google-logo";

// What is printed on a piece, drawn as a small app-icon tile so a list of pieces reads at a glance:
// the Instagram tile is an Instagram piece, the G a Google review sign, an envelope an email piece…

function TikTokGlyph({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
  );
}

function WhatsAppGlyph({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

type Tile = { background: string; color: string; glyph: (cls: string) => ReactNode };

const TILES: Record<TagFace, Tile> = {
  google_review: { background: "#ffffff", color: "#000", glyph: (c) => <GoogleLogo className={c} /> },
  instagram: {
    background: "radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285AEB 90%)",
    color: "#fff",
    glyph: (c) => <Instagram className={c} />,
  },
  facebook: { background: "#1877F2", color: "#fff", glyph: (c) => <Facebook className={c} /> },
  tiktok: { background: "#000000", color: "#fff", glyph: (c) => <TikTokGlyph className={c} /> },
  whatsapp: { background: "#25D366", color: "#fff", glyph: (c) => <WhatsAppGlyph className={c} /> },
  youtube: { background: "#FF0000", color: "#fff", glyph: (c) => <Youtube className={c} /> },
  linkedin: { background: "#0A66C2", color: "#fff", glyph: (c) => <Linkedin className={c} /> },
  website: { background: "#2563eb", color: "#fff", glyph: (c) => <Globe className={c} /> },
  phone: { background: "#16a34a", color: "#fff", glyph: (c) => <Phone className={c} /> },
  email: { background: "#f59e0b", color: "#fff", glyph: (c) => <Mail className={c} /> },
  menu: { background: "#ea580c", color: "#fff", glyph: (c) => <UtensilsCrossed className={c} /> },
  booking: { background: "#0d9488", color: "#fff", glyph: (c) => <CalendarCheck className={c} /> },
  vcard: { background: "#7c3aed", color: "#fff", glyph: (c) => <Contact className={c} /> },
  custom: { background: "linear-gradient(135deg, #5b8cff, #22d3ee)", color: "#fff", glyph: (c) => <Sparkles className={c} /> },
};

const SIZES = {
  xs: { box: "h-5 w-5 rounded-md", glyph: "h-3 w-3" },
  sm: { box: "h-7 w-7 rounded-lg", glyph: "h-4 w-4" },
  md: { box: "h-9 w-9 rounded-xl", glyph: "h-5 w-5" },
  lg: { box: "h-12 w-12 rounded-2xl", glyph: "h-7 w-7" },
} as const;

/**
 * The tile for a piece's face. An unknown face (null) draws a dashed placeholder so the column still
 * lines up and the gap is visible: that piece's print was never recorded.
 */
export function TagFaceIcon({ face, size = "sm", className = "", title }: { face: string | null | undefined; size?: keyof typeof SIZES; className?: string; title?: string }) {
  const tt = useT(tagsMessages);
  const s = SIZES[size];
  if (!isTagFace(face)) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center border border-dashed border-white/20 text-white/30 ${s.box} ${className}`}
        title={title ?? tt("face_none")}
        aria-label={title ?? tt("face_none")}
        role="img"
      >
        <Tag className={s.glyph} />
      </span>
    );
  }
  const tile = TILES[face];
  const style: CSSProperties = { background: tile.background, color: tile.color };
  const label = title ?? tt(`face_${face}`);
  return (
    <span className={`inline-flex shrink-0 items-center justify-center shadow-sm ring-1 ring-white/10 ${s.box} ${className}`} style={style} title={label} aria-label={label} role="img">
      {tile.glyph(s.glyph)}
    </span>
  );
}
