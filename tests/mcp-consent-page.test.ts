import { describe, expect, it } from "vitest";
import { consentLang, journeyRefusalMessage, renderConsentPage, renderErrorPage } from "../server/mcp/consentPage";

describe("consentLang", () => {
  it("picks the best-weighted language the app speaks", () => {
    expect(consentLang("pt-BR,pt;q=0.9,en-US;q=0.8")).toBe("pt");
    expect(consentLang("es-419,es;q=0.9")).toBe("es");
    expect(consentLang("en-US,en;q=0.9,pt;q=0.8")).toBe("en");
    expect(consentLang("fr-FR,fr;q=0.9,es;q=0.5,pt;q=0.4")).toBe("es");
    expect(consentLang("en;q=0.2, pt;q=0.7")).toBe("pt");
  });

  it("falls back to English", () => {
    expect(consentLang(undefined)).toBe("en");
    expect(consentLang("")).toBe("en");
    expect(consentLang("de-DE,fr;q=0.8")).toBe("en");
    expect(consentLang("pt;q=0")).toBe("en");
  });
});

const consent = (lang: "en" | "pt" | "es", clientName: string | null = "Claude") =>
  renderConsentPage({
    lang,
    clientName,
    redirectHost: "claude.ai",
    userLabel: "ana@example.com",
    scopes: ["xpot:journey", "xpot:tasks", "xpot:unknown"],
    fields: { consent_state: "abc" },
  });

describe("renderConsentPage", () => {
  it("speaks the chosen language, scopes included", () => {
    const pt = consent("pt");
    expect(pt).toContain('<html lang="pt-BR">');
    expect(pt).toContain("Claude quer se conectar ao Xpot");
    expect(pt).toContain("Ler e registrar o diário de produção das Tags");
    expect(pt).toContain("Gerenciar suas tarefas do Xpot");
    expect(pt).toContain(">Permitir</button>");
    expect(pt).not.toContain("Read and record the Tags production log");

    const es = consent("es");
    expect(es).toContain("Leer y registrar el diario de producción de Tags");
    expect(es).toContain(">Denegar</button>");

    expect(consent("en")).toContain("Read and record the Tags production log");
  });

  it("shows an unknown scope by its name", () => {
    expect(consent("pt")).toContain("xpot:unknown");
  });

  it("keeps the host and the user in markup and escapes what the app declared", () => {
    const page = consent("pt", "<b>Evil</b> {host}");
    expect(page).toContain("<code>claude.ai</code>");
    expect(page).toContain("<strong>ana@example.com</strong>");
    expect(page).toContain("&lt;b&gt;Evil&lt;/b&gt; {host} quer se conectar");
    expect(page).not.toContain("<b>Evil</b>");
  });

  it("names a nameless app in the page's language", () => {
    expect(consent("es", null)).toContain("Una app MCP quiere conectarse a Xpot");
  });
});

describe("renderErrorPage", () => {
  it("translates the page and the refusal reason", () => {
    const page = renderErrorPage("pt", "accessDenied", "notAdmin");
    expect(page).toContain("Acesso não permitido");
    expect(page).toContain("Só admins do Xpot podem conectar apps de IA ao diário de produção.");
    expect(renderErrorPage("es", "appUnknown")).toContain("Quita el conector de Xpot");
  });

  it("keeps the English reason for MCP clients", () => {
    expect(journeyRefusalMessage("notAdmin")).toBe("Only Xpot admins can connect AI apps to the journey.");
  });
});
