import type { Dictionary } from "../index";

// The shell's information architecture (Phase 3a): the Platform group, the
// visit screen's own title, the management-mode toast, the
// palette's shortcut hints, and the Settings sections (Sign-in and
// Administration). Nav labels shared with older screens stay in shell.ts.

const en = {
  // Sidebar and palette groups (shell.ts has Administration = navOrganization)
  /** The active-visit screen (/route/check-in). */
  visitScreen: "Current visit",

  // Management mode
  /** An owner in the panel: the organizations they run. */

  // Command palette footer: only the shortcuts this screen supports
  shortcutsLabel: "Shortcuts",
  shortcutSearch: "/ search",
  shortcutNew: "N new",
  shortcutRows: "J/K next/previous row",

  // Settings
  tabSignIn: "Sign-in",
  photo: "Profile photo",
  photoHint: "Shown to your team and on your visits.",
  photoHintTeam: "Shown to your team.",
  moreProfile: "More",
  contactPhone: "Contact phone (not used to sign in)",
  signInPhone: "Sign-in phone",
  signInPhoneHint: "To change it, talk to the Xpot team.",
  signInPhoneAdminHint: "Change it in People.",
  signInPhoneNone: "No sign-in phone on file",
  signInEmail: "Sign-in email",
  password: "Password",
  modules: "Modules",
  noOrganizations: "Not in any organization",
  administration: "Administration",
};

export const navIaMessages: Dictionary<typeof en> = {
  en,
  pt: {
    visitScreen: "Visita atual",

    shortcutsLabel: "Atalhos",
    shortcutSearch: "/ buscar",
    shortcutNew: "N novo",
    shortcutRows: "J/K próxima/anterior",

    tabSignIn: "Acesso",
    photo: "Foto do perfil",
    photoHint: "Aparece para a sua equipe e nas suas visitas.",
    photoHintTeam: "Aparece para a sua equipe.",
    moreProfile: "Mais",
    contactPhone: "Telefone de contato (não serve para entrar)",
    signInPhone: "Telefone de acesso",
    signInPhoneHint: "Para mudar, fale com a equipe do Xpot.",
    signInPhoneAdminHint: "Altere em Pessoas.",
    signInPhoneNone: "Nenhum telefone de acesso cadastrado",
    signInEmail: "E-mail de acesso",
    password: "Senha",
    modules: "Módulos",
    noOrganizations: "Não faz parte de nenhuma organização",
    administration: "Administração",
  },
  es: {
    visitScreen: "Visita actual",

    shortcutsLabel: "Atajos",
    shortcutSearch: "/ buscar",
    shortcutNew: "N nuevo",
    shortcutRows: "J/K siguiente/anterior",

    tabSignIn: "Acceso",
    photo: "Foto de perfil",
    photoHint: "La ve tu equipo y aparece en tus visitas.",
    photoHintTeam: "La ve tu equipo.",
    moreProfile: "Más",
    contactPhone: "Teléfono de contacto (no sirve para iniciar sesión)",
    signInPhone: "Teléfono de acceso",
    signInPhoneHint: "Para cambiarlo, habla con el equipo de Xpot.",
    signInPhoneAdminHint: "Cámbialo en Personas.",
    signInPhoneNone: "No hay teléfono de acceso registrado",
    signInEmail: "Correo de acceso",
    password: "Contraseña",
    modules: "Módulos",
    noOrganizations: "No pertenece a ninguna organización",
    administration: "Administración",
  },
};
