export type UsStateLanguage = "en" | "pt" | "es";
export type UsStateOption = { code: string; en: string; pt: string; es: string };

export const US_STATES: UsStateOption[] = [
  { code: "AL", en: "Alabama", pt: "Alabama", es: "Alabama" },
  { code: "AK", en: "Alaska", pt: "Alasca", es: "Alaska" },
  { code: "AZ", en: "Arizona", pt: "Arizona", es: "Arizona" },
  { code: "AR", en: "Arkansas", pt: "Arkansas", es: "Arkansas" },
  { code: "CA", en: "California", pt: "Califórnia", es: "California" },
  { code: "CO", en: "Colorado", pt: "Colorado", es: "Colorado" },
  { code: "CT", en: "Connecticut", pt: "Connecticut", es: "Connecticut" },
  { code: "DE", en: "Delaware", pt: "Delaware", es: "Delaware" },
  { code: "FL", en: "Florida", pt: "Flórida", es: "Florida" },
  { code: "GA", en: "Georgia", pt: "Geórgia", es: "Georgia" },
  { code: "HI", en: "Hawaii", pt: "Havaí", es: "Hawái" },
  { code: "ID", en: "Idaho", pt: "Idaho", es: "Idaho" },
  { code: "IL", en: "Illinois", pt: "Illinois", es: "Illinois" },
  { code: "IN", en: "Indiana", pt: "Indiana", es: "Indiana" },
  { code: "IA", en: "Iowa", pt: "Iowa", es: "Iowa" },
  { code: "KS", en: "Kansas", pt: "Kansas", es: "Kansas" },
  { code: "KY", en: "Kentucky", pt: "Kentucky", es: "Kentucky" },
  { code: "LA", en: "Louisiana", pt: "Luisiana", es: "Luisiana" },
  { code: "ME", en: "Maine", pt: "Maine", es: "Maine" },
  { code: "MD", en: "Maryland", pt: "Maryland", es: "Maryland" },
  { code: "MA", en: "Massachusetts", pt: "Massachusetts", es: "Massachusetts" },
  { code: "MI", en: "Michigan", pt: "Michigan", es: "Míchigan" },
  { code: "MN", en: "Minnesota", pt: "Minnesota", es: "Minnesota" },
  { code: "MS", en: "Mississippi", pt: "Mississippi", es: "Misisipi" },
  { code: "MO", en: "Missouri", pt: "Missouri", es: "Misuri" },
  { code: "MT", en: "Montana", pt: "Montana", es: "Montana" },
  { code: "NE", en: "Nebraska", pt: "Nebraska", es: "Nebraska" },
  { code: "NV", en: "Nevada", pt: "Nevada", es: "Nevada" },
  { code: "NH", en: "New Hampshire", pt: "Nova Hampshire", es: "Nuevo Hampshire" },
  { code: "NJ", en: "New Jersey", pt: "Nova Jersey", es: "Nueva Jersey" },
  { code: "NM", en: "New Mexico", pt: "Novo México", es: "Nuevo México" },
  { code: "NY", en: "New York", pt: "Nova York", es: "Nueva York" },
  { code: "NC", en: "North Carolina", pt: "Carolina do Norte", es: "Carolina del Norte" },
  { code: "ND", en: "North Dakota", pt: "Dakota do Norte", es: "Dakota del Norte" },
  { code: "OH", en: "Ohio", pt: "Ohio", es: "Ohio" },
  { code: "OK", en: "Oklahoma", pt: "Oklahoma", es: "Oklahoma" },
  { code: "OR", en: "Oregon", pt: "Oregon", es: "Oregón" },
  { code: "PA", en: "Pennsylvania", pt: "Pensilvânia", es: "Pensilvania" },
  { code: "RI", en: "Rhode Island", pt: "Rhode Island", es: "Rhode Island" },
  { code: "SC", en: "South Carolina", pt: "Carolina do Sul", es: "Carolina del Sur" },
  { code: "SD", en: "South Dakota", pt: "Dakota do Sul", es: "Dakota del Sur" },
  { code: "TN", en: "Tennessee", pt: "Tennessee", es: "Tennessee" },
  { code: "TX", en: "Texas", pt: "Texas", es: "Texas" },
  { code: "UT", en: "Utah", pt: "Utah", es: "Utah" },
  { code: "VT", en: "Vermont", pt: "Vermont", es: "Vermont" },
  { code: "VA", en: "Virginia", pt: "Virgínia", es: "Virginia" },
  { code: "WA", en: "Washington", pt: "Washington", es: "Washington" },
  { code: "WV", en: "West Virginia", pt: "Virgínia Ocidental", es: "Virginia Occidental" },
  { code: "WI", en: "Wisconsin", pt: "Wisconsin", es: "Wisconsin" },
  { code: "WY", en: "Wyoming", pt: "Wyoming", es: "Wyoming" },
  { code: "DC", en: "District of Columbia", pt: "Distrito de Colúmbia", es: "Distrito de Columbia" },
  { code: "PR", en: "Puerto Rico", pt: "Porto Rico", es: "Puerto Rico" },
];

export const US_STATE_CODES = US_STATES.map((state) => state.code);

function comparable(value: string) {
  return value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function findUsStateCode(value: string): string | null {
  const compact = value.trim().toUpperCase();
  if (US_STATE_CODES.includes(compact)) return compact;
  const token = compact.match(/(?:^|\s)([A-Z]{2})(?:\s|\d|$)/)?.[1];
  if (token && US_STATE_CODES.includes(token)) return token;
  const target = comparable(value);
  return US_STATES.find((state) => [state.en, state.pt, state.es].some((name) => comparable(name) === target))?.code ?? null;
}

export function usStateLabel(code: string, lang: UsStateLanguage) {
  const state = US_STATES.find((option) => option.code === code);
  return state ? `${state.code} — ${state[lang]}` : code;
}
