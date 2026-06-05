import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "@/components/ui/loader";
import { Upload, Palette } from "lucide-react";

type Branding = {
  faviconUrl: string | null;
  faviconContentType: string | null;
  appName: string;
  shortName: string;
  themeColor: string;
  backgroundColor: string;
  updatedAt: string | null;
};

export function AdminBranding() {
  const query = useQuery<Branding>({ queryKey: ["/api/xpot/admin/branding"] });

  if (query.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return <p className="text-sm text-red-400">Falha ao carregar branding.</p>;
  }

  return <BrandingForm branding={query.data} />;
}

function BrandingForm({ branding }: { branding: Branding }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [appName, setAppName] = useState(branding.appName);
  const [shortName, setShortName] = useState(branding.shortName);
  const [themeColor, setThemeColor] = useState(branding.themeColor);
  const [backgroundColor, setBackgroundColor] = useState(branding.backgroundColor);

  const previewSrc = branding.faviconUrl
    ? `${branding.faviconUrl}${branding.faviconUrl.includes("?") ? "&" : "?"}t=${branding.updatedAt ?? ""}`
    : "/favicon.png";

  const upload = useMutation({
    mutationFn: async (imageData: string) => {
      const res = await apiRequest("POST", "/api/xpot/admin/branding/favicon", { imageData });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Ícone atualizado" });
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/admin/branding"] });
    },
    onError: (e: Error) => toast({ title: "Erro no upload", description: e.message, variant: "destructive" }),
  });

  const saveMeta = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/xpot/admin/branding", {
        appName,
        shortName,
        themeColor,
        backgroundColor,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Branding salvo" });
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/admin/branding"] });
    },
    onError: (e: Error) => toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" }),
  });

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: "Máximo 2MB.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => upload.mutate(reader.result as string);
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-white/50">
        <Palette className="h-4 w-4" />
        Ícone do app usado em favicon, apple-touch-icon, manifest PWA e preview de link (OG). Recomendado: PNG quadrado ≥ 512×512.
      </div>

      {/* Upload */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h3 className="font-semibold">Ícone</h3>
        <div className="mt-4 flex items-center gap-5">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-[#0a0f1e]">
            <img src={previewSrc} alt="favicon" className="h-16 w-16 object-contain" />
          </div>
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,.ico"
              onChange={onFile}
              className="hidden"
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={upload.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
            >
              {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Enviar imagem
            </button>
            <p className="mt-2 text-xs text-white/35">PNG, SVG, ICO, JPG ou WEBP — até 2MB.</p>
          </div>
        </div>
      </div>

      {/* Metadata */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h3 className="font-semibold">App & cores (PWA)</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-white/50">Nome do app</label>
            <input
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#0a0f1e] px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-white/50">Nome curto</label>
            <input
              value={shortName}
              onChange={(e) => setShortName(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#0a0f1e] px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-white/50">Theme color</label>
            <div className="flex items-center gap-2">
              <input type="color" value={themeColor} onChange={(e) => setThemeColor(e.target.value)} className="h-9 w-12 rounded border border-white/10 bg-transparent" />
              <input value={themeColor} onChange={(e) => setThemeColor(e.target.value)} className="w-full rounded-lg border border-white/10 bg-[#0a0f1e] px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-white/50">Background color</label>
            <div className="flex items-center gap-2">
              <input type="color" value={backgroundColor} onChange={(e) => setBackgroundColor(e.target.value)} className="h-9 w-12 rounded border border-white/10 bg-transparent" />
              <input value={backgroundColor} onChange={(e) => setBackgroundColor(e.target.value)} className="w-full rounded-lg border border-white/10 bg-[#0a0f1e] px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50" />
            </div>
          </div>
        </div>
        <div className="mt-4">
          <button
            onClick={() => saveMeta.mutate()}
            disabled={saveMeta.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
          >
            {saveMeta.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
