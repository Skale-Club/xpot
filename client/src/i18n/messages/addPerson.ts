import type { Dictionary } from "../index";

// "Add person" (pages/xpot/components/AddPersonForm.tsx), used by an organization's Team tab and by
// Settings › My organization. Inside an organization there are two roles, owner and employee: whoever
// is added here is an employee. The refusals (another organization, a platform admin…) come from the
// server worded through apiErrors.ts.

const en = {
  title: "Add person",
  hint: "They join as an employee, with their own pieces, in this organization. They sign in with a code sent to their phone.",
  firstName: "First name",
  lastName: "Last name",
  phone: "Phone",
  phoneHint: "The number they sign in with.",
  country: "Country",
  add: "Add person",
  added: "{name} added",
  canSignIn: "{name} can sign in now with a code sent to {phone}.",
  addedExisting: "{name} joined the organization.",

  // My organization (Settings)
  sectionTitle: "My company",
  organization: "Organization",
  yourRole: "Your role",
  roleOwner: "Owner",
  roleEmployee: "Employee",
  ownerHint: "As the owner you see everything in this organization. Add the people who work with you: each has their own pieces.",
  employeeHint: "You work for this company. Your pieces and customers stay under your name.",
  team: "People in this organization",
  openTeam: "Manage team",
  soloHint: "Selling on your own? Add someone to work with you, like a partner or a relative. Each of you keeps your own pieces.",
};

export const addPersonMessages: Dictionary<typeof en> = {
  en,
  pt: {
    title: "Adicionar pessoa",
    hint: "Ela entra como funcionária, com as próprias peças, nesta organização. Entra no app com um código enviado ao telefone dela.",
    firstName: "Nome",
    lastName: "Sobrenome",
    phone: "Telefone",
    phoneHint: "O número com o qual ela entra.",
    country: "País",
    add: "Adicionar pessoa",
    added: "{name} adicionado",
    canSignIn: "{name} já pode entrar com um código enviado para {phone}.",
    addedExisting: "{name} entrou na organização.",

    sectionTitle: "Minha empresa",
    organization: "Organização",
    yourRole: "Seu papel",
    roleOwner: "Dono",
    roleEmployee: "Funcionário",
    ownerHint: "Como dono, você vê tudo nesta organização. Adicione as pessoas que trabalham com você: cada uma tem as próprias peças.",
    employeeHint: "Você trabalha para esta empresa. Suas peças e clientes ficam no seu nome.",
    team: "Pessoas desta organização",
    openTeam: "Gerenciar equipe",
    soloHint: "Vende sozinho? Adicione alguém para trabalhar com você, como um sócio ou um parente. Cada um fica com as próprias peças.",
  },
  es: {
    title: "Agregar persona",
    hint: "Entra como empleado, con sus propias piezas, en esta organización. Inicia sesión con un código enviado a su teléfono.",
    firstName: "Nombre",
    lastName: "Apellido",
    phone: "Teléfono",
    phoneHint: "El número con el que inicia sesión.",
    country: "País",
    add: "Agregar persona",
    added: "{name} agregado",
    canSignIn: "{name} ya puede iniciar sesión con un código enviado a {phone}.",
    addedExisting: "{name} entró en la organización.",

    sectionTitle: "Mi empresa",
    organization: "Organización",
    yourRole: "Tu rol",
    roleOwner: "Dueño",
    roleEmployee: "Empleado",
    ownerHint: "Como dueño ves todo en esta organización. Agrega a las personas que trabajan contigo: cada una tiene sus propias piezas.",
    employeeHint: "Trabajas para esta empresa. Tus piezas y clientes quedan a tu nombre.",
    team: "Personas de esta organización",
    openTeam: "Gestionar equipo",
    soloHint: "¿Vendes por tu cuenta? Agrega a alguien para trabajar contigo, como un socio o un familiar. Cada uno conserva sus propias piezas.",
  },
};
