import type { Dictionary } from "../index";

// Words the admin and account screens gained when they moved onto the shared UI
// kit (pages/admin/*, Settings, Organizations, the form footer). The rest of
// their words stay in manage.ts, integrations.ts, systemHealth.ts and friends.

const en = {
  unsavedChanges: "Unsaved changes",
  // Products
  searchProducts: "Search by name, SKU or category",
  productsLoadFailed: "Could not load the products.",
  noProductsMatch: "No product matches this search.",
  archiveProductTitle: "Archive {name}?",
  archiveProductBody: "It stops showing up for new sales. Past sales and consignments keep it.",
  removeTier: "Remove tier",
  // People
  refuseTitle: "Refuse {name}'s sign-up?",
  refuseBody: "They can't sign in. The sign-up stays listed under Refused.",
  changePhoneTitle: "Change {name}'s sign-in phone",
};

export const adminUiMessages: Dictionary<typeof en> = {
  en,
  pt: {
    unsavedChanges: "Alterações não salvas",
    searchProducts: "Buscar por nome, SKU ou categoria",
    productsLoadFailed: "Não foi possível carregar os produtos.",
    noProductsMatch: "Nenhum produto corresponde a esta busca.",
    archiveProductTitle: "Arquivar {name}?",
    archiveProductBody: "Ele deixa de aparecer em vendas novas. Vendas e consignações antigas continuam com ele.",
    removeTier: "Remover faixa",
    refuseTitle: "Recusar o cadastro de {name}?",
    refuseBody: "A pessoa não consegue entrar. O cadastro fica listado em Recusados.",
    changePhoneTitle: "Trocar o telefone de acesso de {name}",
  },
  es: {
    unsavedChanges: "Cambios sin guardar",
    searchProducts: "Buscar por nombre, SKU o categoría",
    productsLoadFailed: "No se pudieron cargar los productos.",
    noProductsMatch: "Ningún producto coincide con esta búsqueda.",
    archiveProductTitle: "¿Archivar {name}?",
    archiveProductBody: "Deja de aparecer en ventas nuevas. Las ventas y consignaciones anteriores lo conservan.",
    removeTier: "Quitar escala",
    refuseTitle: "¿Rechazar el registro de {name}?",
    refuseBody: "No podrá entrar. El registro queda en la lista de Rechazados.",
    changePhoneTitle: "Cambiar el teléfono de acceso de {name}",
  },
};
