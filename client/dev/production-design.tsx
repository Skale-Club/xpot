// Development-only visual acceptance surface. No real batches, credentials or printer are involved.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { printGenerateOptions, type PrintModelItem } from "@shared/printProduction";
import { I18nProvider } from "@/i18n";
import { GenerateDialog } from "@/pages/admin/tags/production-generate";
import { Toaster } from "@/components/ui/toaster";
import "@/index.css";

const queryClient = new QueryClient({ defaultOptions: { queries: { queryFn: async ({ queryKey }) => {
  const response = await fetch(String(queryKey[0]));
  if (!response.ok) throw new Error('Preview fixture unavailable');
  return response.json();
} } } });

function Preview() {
  const { data: models } = useQuery<PrintModelItem[]>({ queryKey: ["/api/xpot/admin/print-models"] });
  const [product, setProduct] = useState("large_stand");
  const [open, setOpen] = useState(true);
  const options = printGenerateOptions(models ?? []);
  const selected = options.find((o) => o.productType === product);
  return <main className="min-h-screen bg-[#080c13] p-6 text-white"><p className="mb-4 text-sm text-white/60">Local visual acceptance · sample catalog · no production writes</p>
    <div className="flex flex-wrap gap-2">{options.map((option) => <button key={option.productType} className="rounded-xl border border-white/20 px-4 py-3" onClick={() => { setProduct(option.productType); setOpen(true); }}>{option.productType}</button>)}</div>
    {selected && open ? <GenerateDialog key={product} option={selected} models={new Map(models?.map((m) => [m.slug, m]))} onClose={() => setOpen(false)} onGenerated={() => setOpen(false)} /> : null}
    <Toaster />
  </main>;
}
createRoot(document.getElementById("root")!).render(<QueryClientProvider client={queryClient}><I18nProvider><Preview /></I18nProvider></QueryClientProvider>);
