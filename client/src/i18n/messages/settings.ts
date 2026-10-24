import type { Dictionary } from "../index";

// Rep settings (client/src/pages/xpot/XpotSettings.tsx) and the quick profile
// editor dialog (client/src/pages/xpot/XpotProfileEditor.tsx).

const en = {
  title: "Settings",
  languageHint: "Choose the language of the app on this device.",

  // Profile
  sectionProfile: "Profile",
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
  currentPassword: "Current password",
  currentPasswordPlaceholder: "Enter current password",
  newPassword: "New password",
  newPasswordPlaceholder: "At least 8 characters",
  confirmPassword: "Confirm new password",
  confirmPasswordPlaceholder: "Re-enter new password",
  passwordsMismatch: "Passwords do not match",
  passwordRequired: "Enter a new password",
  passwordTooShort: "Password must be at least 8 characters",
  changePassword: "Change password",
  passwordChanged: "Password changed",
  passwordChangeFailed: "Failed to change password",
  showPassword: "Show password",
  hidePassword: "Hide password",

  // Access (Settings › Administration, management mode on)
  role: "Role",
  role_rep: "Rep",
  role_manager: "Manager",
  role_admin: "Xpot admin",

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

    currentPassword: "Senha atual",
    currentPasswordPlaceholder: "Digite a senha atual",
    newPassword: "Nova senha",
    newPasswordPlaceholder: "Pelo menos 8 caracteres",
    confirmPassword: "Confirme a nova senha",
    confirmPasswordPlaceholder: "Digite a nova senha de novo",
    passwordsMismatch: "As senhas não são iguais",
    passwordRequired: "Digite uma nova senha",
    passwordTooShort: "A senha precisa ter pelo menos 8 caracteres",
    changePassword: "Alterar senha",
    passwordChanged: "Senha alterada",
    passwordChangeFailed: "Não foi possível alterar a senha",
    showPassword: "Mostrar senha",
    hidePassword: "Ocultar senha",

    role: "Papel",
    role_rep: "Vendedor",
    role_manager: "Gerente",
    role_admin: "Admin do Xpot",

    saveFailed: "Não foi possível salvar",
    saveChanges: "Salvar alterações",
  },
  es: {
    title: "Ajustes",
    languageHint: "Elige el idioma de la app en este dispositivo.",

    sectionProfile: "Perfil",
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

    currentPassword: "Contraseña actual",
    currentPasswordPlaceholder: "Escribe tu contraseña actual",
    newPassword: "Nueva contraseña",
    newPasswordPlaceholder: "Al menos 8 caracteres",
    confirmPassword: "Confirma la nueva contraseña",
    confirmPasswordPlaceholder: "Escribe la nueva contraseña otra vez",
    passwordsMismatch: "Las contraseñas no coinciden",
    passwordRequired: "Escribe una nueva contraseña",
    passwordTooShort: "La contraseña debe tener al menos 8 caracteres",
    changePassword: "Cambiar contraseña",
    passwordChanged: "Contraseña cambiada",
    passwordChangeFailed: "No se pudo cambiar la contraseña",
    showPassword: "Mostrar contraseña",
    hidePassword: "Ocultar contraseña",

    role: "Rol",
    role_rep: "Vendedor",
    role_manager: "Gerente",
    role_admin: "Admin de Xpot",

    saveFailed: "No se pudo guardar",
    saveChanges: "Guardar cambios",
  },
};
