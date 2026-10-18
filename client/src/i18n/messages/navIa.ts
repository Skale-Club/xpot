import type { Dictionary } from "../index";

// The shell's information architecture (Phase 3a): the Platform group, the
// visit screen's own title, the management-mode scope chip and toast, the
// palette's shortcut hints, and the Settings tabs (Sign-in, Memberships and
// the Administration entry). Nav labels shared with older screens stay in shell.ts.

const en = {
  // Sidebar and palette groups (shell.ts has Administration = navOrganization)
  navPlatform: "Platform",
  /** The active-visit screen (/route/check-in). */
  visitScreen: "Visit",

  // Management mode
  managementOnTitle: "Management mode on",
  managementOnBody: "Lists show the whole team. Leave it from the amber bar.",
  scopeEveryone: "Viewing: everyone",
  scopeOnlyMe: "Viewing: only me",
  scopeToEveryone: "Show the whole team (management mode)",
  scopeToOnlyMe: "Show only my records",

  // Command palette footer: only the shortcuts this screen supports
  shortcutsLabel: "Shortcuts",
  shortcutSearch: "/ search",
  shortcutNew: "N new",
  shortcutRows: "J/K next/previous row",

  // Settings
  tabSignIn: "Sign-in",
  photo: "Profile photo",
  photoHint: "Shown to your team and on your visits.",
  contactPhone: "Contact phone (not used to sign in)",
  signInPhone: "Sign-in phone",
  signInPhoneHint: "To change it, ask a manager.",
  signInPhoneNone: "No sign-in phone on file",
  signInEmail: "Sign-in email",
  password: "Password",
  passwordHint: "Only for signing in with your email.",
  modules: "Modules",
  organizations: "Organizations",
  noOrganizations: "Not in any organization",
  administration: "Administration",
  administrationHint: "People, organizations and, for the Xpot admin, the platform setup.",
  managementMode: "Management mode",
  managementModeHint: "Lists show the whole team and each module gets its Manage tab. It is a view on this device.",
};

export const navIaMessages: Dictionary<typeof en> = {
  en,
  pt: {
    navPlatform: "Plataforma",
    visitScreen: "Visita",

    managementOnTitle: "Modo gestão ligado",
    managementOnBody: "As listas mostram toda a equipe. Saia pela barra âmbar.",
    scopeEveryone: "Vendo: todos",
    scopeOnlyMe: "Vendo: só eu",
    scopeToEveryone: "Mostrar toda a equipe (modo gestão)",
    scopeToOnlyMe: "Mostrar só os meus registros",

    shortcutsLabel: "Atalhos",
    shortcutSearch: "/ buscar",
    shortcutNew: "N novo",
    shortcutRows: "J/K próxima/anterior",

    tabSignIn: "Acesso",
    photo: "Foto do perfil",
    photoHint: "Aparece para a sua equipe e nas suas visitas.",
    contactPhone: "Telefone de contato (não serve para entrar)",
    signInPhone: "Telefone de acesso",
    signInPhoneHint: "Para trocar, peça a um gestor.",
    signInPhoneNone: "Nenhum telefone de acesso cadastrado",
    signInEmail: "E-mail de acesso",
    password: "Senha",
    passwordHint: "Só para entrar com o seu e-mail.",
    modules: "Módulos",
    organizations: "Organizações",
    noOrganizations: "Não faz parte de nenhuma organização",
    administration: "Administração",
    administrationHint: "Pessoas, organizações e, para o admin do Xpot, a configuração da plataforma.",
    managementMode: "Modo gestão",
    managementModeHint: "As listas mostram toda a equipe e cada módulo ganha a aba Gestão. Vale só neste aparelho.",
  },
  es: {
    navPlatform: "Plataforma",
    visitScreen: "Visita",

    managementOnTitle: "Modo gestión activado",
    managementOnBody: "Las listas muestran a todo el equipo. Sal desde la barra ámbar.",
    scopeEveryone: "Viendo: todos",
    scopeOnlyMe: "Viendo: solo yo",
    scopeToEveryone: "Mostrar a todo el equipo (modo gestión)",
    scopeToOnlyMe: "Mostrar solo mis registros",

    shortcutsLabel: "Atajos",
    shortcutSearch: "/ buscar",
    shortcutNew: "N nuevo",
    shortcutRows: "J/K siguiente/anterior",

    tabSignIn: "Acceso",
    photo: "Foto de perfil",
    photoHint: "La ve tu equipo y aparece en tus visitas.",
    contactPhone: "Teléfono de contacto (no sirve para iniciar sesión)",
    signInPhone: "Teléfono de acceso",
    signInPhoneHint: "Para cambiarlo, pídeselo a un gerente.",
    signInPhoneNone: "No hay teléfono de acceso registrado",
    signInEmail: "Correo de acceso",
    password: "Contraseña",
    passwordHint: "Solo para iniciar sesión con tu correo.",
    modules: "Módulos",
    organizations: "Organizaciones",
    noOrganizations: "No pertenece a ninguna organización",
    administration: "Administración",
    administrationHint: "Personas, organizaciones y, para el admin de Xpot, la configuración de la plataforma.",
    managementMode: "Modo gestión",
    managementModeHint: "Las listas muestran a todo el equipo y cada módulo tiene su pestaña Gestión. Vale solo en este dispositivo.",
  },
};
