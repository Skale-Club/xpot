// Search and filters of Account › People (AdminReps.tsx), kept pure for the tests.

import { repModules, type XpotModule } from "@shared/modules";

export type PeopleStatus = "pending" | "active" | "blocked" | "refused";

export type PeopleFilters = {
  search: string;
  status: PeopleStatus | "all";
  role: "rep" | "manager" | "admin" | "all";
  module: XpotModule | "all";
};

export const NO_PEOPLE_FILTERS: PeopleFilters = { search: "", status: "all", role: "all", module: "all" };

type Person = {
  displayName: string;
  email: string | null;
  phone: string | null;
  loginPhone: string | null;
  team: string | null;
  role: string;
  modules: string[] | null;
  access: "pending" | "active" | "blocked";
  refused?: boolean;
};

/** Where someone stands: a refused sign-up is its own status, apart from "blocked". */
export function personStatus(person: Pick<Person, "access" | "refused">): PeopleStatus {
  return person.access === "blocked" && person.refused ? "refused" : person.access;
}

const STATUSES: readonly PeopleStatus[] = ["pending", "active", "blocked", "refused"];
const ROLES = ["rep", "manager", "admin"] as const;
const MODULES: readonly XpotModule[] = ["visits", "tags"];

/**
 * The filters from the URL (?q=&status=&role=&module=), so another screen can
 * link to a filtered list (the Visits overview opens "active, with Visits").
 * An unknown value is "all".
 */
export function peopleFiltersFromParams(params: { q?: string; status?: string; role?: string; module?: string }): PeopleFilters {
  const pick = <T extends string>(list: readonly T[], value: string | undefined): T | "all" =>
    list.find((item) => item === value) ?? "all";
  return {
    search: params.q ?? "",
    status: pick(STATUSES, params.status),
    role: pick(ROLES, params.role),
    module: pick(MODULES, params.module),
  };
}

const digits = (value: string) => value.replace(/\D/g, "");

export function filterPeople<T extends Person>(people: T[], filters: PeopleFilters): T[] {
  const query = filters.search.trim().toLowerCase();
  const queryDigits = digits(query);
  return people.filter((person) => {
    if (filters.status !== "all" && personStatus(person) !== filters.status) return false;
    if (filters.role !== "all" && person.role !== filters.role) return false;
    if (filters.module !== "all" && !repModules({ role: person.role, modules: person.modules }).includes(filters.module)) return false;
    if (!query) return true;
    const text = [person.displayName, person.email, person.team].filter(Boolean).join(" ").toLowerCase();
    if (text.includes(query)) return true;
    // Phones match on their digits, so "+1 (305)" finds "13055550142".
    return queryDigits.length >= 3 && [person.loginPhone, person.phone].some((phone) => phone && digits(phone).includes(queryDigits));
  });
}
