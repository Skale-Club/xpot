import type { Dictionary } from "../index";

// Rep settings (client/src/pages/xpot/XpotSettings.tsx) and the quick profile
// editor dialog (client/src/pages/xpot/XpotProfileEditor.tsx).

const en = {
  title: "Settings",
  languageHint: "Choose the language of the app on this device.",

  // Profile
  sectionProfile: "Profile",
  editProfile: "Photo, name and phone",
  // A row of the phone list: management mode on or off
  firstName: "First name",
  firstNamePlaceholder: "First name",
  lastName: "Last name",
  lastNamePlaceholder: "Last name",
  displayName: "Display name",
  displayNamePlaceholder: "Display name",
  phone: "Phone",
  saving: "Saving…",
  saveProfile: "Save profile",
  profileSaved: "Profile saved",
  profileSaveFailed: "Failed to save profile",
  noChanges: "No changes to save",

  // Security

  // Access (Settings › Administration, management mode on)
  role: "Role",
  role_rep: "Rep",
  role_admin: "Skale Club",

  saveFailed: "Failed to save",

  // Generic save button
  saveChanges: "Save changes",
};

export const settingsMessages: Dictionary<typeof en> = {
  en,
  pt: {
    title: "Configurações",
    languageHint: "Escolha o idioma do app neste aparelho.",

    sectionProfile: "Perfil",
    editProfile: "Foto, nome e telefone",
    firstName: "Nome",
    firstNamePlaceholder: "Nome",
    lastName: "Sobrenome",
    lastNamePlaceholder: "Sobrenome",
    displayName: "Nome de exibição",
    displayNamePlaceholder: "Nome de exibição",
    phone: "Telefone",
    saving: "Salvando…",
    saveProfile: "Salvar perfil",
    profileSaved: "Perfil salvo",
    profileSaveFailed: "Não foi possível salvar o perfil",
    noChanges: "Nada para salvar",


    role: "Função",
    role_rep: "Vendedor",
    role_admin: "Skale Club",

    saveFailed: "Não foi possível salvar",
    saveChanges: "Salvar alterações",
  },
  es: {
    title: "Ajustes",
    languageHint: "Elige el idioma de la app en este dispositivo.",

    sectionProfile: "Perfil",
    editProfile: "Foto, nombre y teléfono",
    firstName: "Nombre",
    firstNamePlaceholder: "Nombre",
    lastName: "Apellido",
    lastNamePlaceholder: "Apellido",
    displayName: "Nombre visible",
    displayNamePlaceholder: "Nombre visible",
    phone: "Teléfono",
    saving: "Guardando…",
    saveProfile: "Guardar perfil",
    profileSaved: "Perfil guardado",
    profileSaveFailed: "No se pudo guardar el perfil",
    noChanges: "No hay cambios para guardar",


    role: "Rol",
    role_rep: "Vendedor",
    role_admin: "Skale Club",

    saveFailed: "No se pudo guardar",
    saveChanges: "Guardar cambios",
  },
};
