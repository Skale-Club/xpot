// Sales module data layer: catalog, direct sales, consigned stock, analytics.
//
// Every query key starts with its resource path so invalidateXpotData()'s
// prefix invalidation ("/api/xpot/sales", "/api/xpot/consignments",
// "/api/xpot/products") sweeps the whole family after a mutation.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { salesModuleMessages } from "@/i18n/messages/salesModule";
import { formatCents } from "../utils";
import type {
  SalesProduct,
  SalesProductPriceTier,
  SalesSale,
  SalesSaleItem,
  SalesConsignment,
  SalesConsignmentMovement,
} from "#shared/schema.js";

export type ProductWithTiers = SalesProduct & { tiers: SalesProductPriceTier[] };
export type LeadRef = { id: number; name: string };
export type ProductRef = Pick<SalesProduct, "id" | "name" | "sku" | "kind" | "unitLabel" | "currency">;
export type SaleWithItems = { sale: SalesSale; items: SalesSaleItem[]; lead: LeadRef | null };
export type ConsignmentWithRefs = { consignment: SalesConsignment; product: ProductRef | null; lead: LeadRef | null };
export type ConsignmentDetail = ConsignmentWithRefs & { movements: SalesConsignmentMovement[] };

export type SalesSummary = {
  period: { days: number; from: string; to: string };
  revenue: { todayCents: number; periodCents: number; monthToDateCents: number };
  profit: { todayCents: number; periodCents: number; monthToDateCents: number };
  sales: { periodCount: number; unitsSold: number; directCents: number; settlementCents: number };
  unpaid: { count: number; cents: number };
  byProduct: { productId: number | null; name: string; quantity: number; revenueCents: number; profitCents: number }[];
  daily: { date: string; revenueCents: number; profitCents: number; salesCount: number }[];
  consignment: { activeCount: number; unitsOnHand: number; valueOnHandCents: number; dueCount: number; dueSoonCount: number };
};

export type LeadSalesSnapshot = {
  lifetimeCents: number;
  lifetimeProfitCents: number;
  salesCount: number;
  lastSaleAt: string | null;
  activeConsignments: ConsignmentWithRefs[];
};

export type PaymentMethod = "cash" | "card" | "pix" | "transfer" | "invoice" | "other";
export type PaymentStatus = "unpaid" | "partial" | "paid";

export const PAYMENT_METHODS: readonly PaymentMethod[] = ["cash", "card", "pix", "transfer", "invoice", "other"];
export const PAYMENT_STATUSES: readonly PaymentStatus[] = ["paid", "partial", "unpaid"];

/** Select options for payment status and method, in the language in use. */
export function usePaymentOptions() {
  const t = useT(salesModuleMessages);
  return {
    statusOptions: PAYMENT_STATUSES.map((value) => ({ value, label: t(`payment_${value}`) })),
    methodOptions: PAYMENT_METHODS.map((value) => ({ value, label: t(`method_${value}`) })),
  };
}

function qs(params: Record<string, string | number | undefined | null>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

async function getJson<T>(url: string): Promise<T> {
  const res = await apiRequest("GET", url);
  return res.json() as Promise<T>;
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export function useProducts(opts: { all?: boolean; enabled?: boolean } = {}) {
  return useQuery<ProductWithTiers[]>({
    queryKey: ["/api/xpot/products", opts.all ? "all" : "active"],
    queryFn: () => getJson(`/api/xpot/products${qs({ all: opts.all ? "true" : undefined })}`),
    enabled: opts.enabled ?? true,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSalesList(filters: { leadId?: number; visitId?: number; repId?: number; status?: "completed" | "cancelled"; days?: number; limit?: number } = {}, enabled = true) {
  return useQuery<SaleWithItems[]>({
    queryKey: ["/api/xpot/sales", "list", filters],
    queryFn: () => getJson(`/api/xpot/sales${qs(filters)}`),
    enabled,
  });
}

export function useSale(id: number | null) {
  return useQuery<SaleWithItems>({
    queryKey: ["/api/xpot/sales", "one", id],
    queryFn: () => getJson(`/api/xpot/sales/${id}`),
    enabled: id != null,
  });
}

export function useSalesSummary(days = 30, repId?: number, enabled = true) {
  return useQuery<SalesSummary>({
    queryKey: ["/api/xpot/sales", "summary", days, repId ?? null],
    queryFn: () => getJson(`/api/xpot/sales/summary${qs({ days, repId })}`),
    enabled,
  });
}

export function useLeadSalesSnapshot(leadId: number | null) {
  return useQuery<LeadSalesSnapshot>({
    queryKey: ["/api/xpot/sales", "lead", leadId],
    queryFn: () => getJson(`/api/xpot/sales/lead/${leadId}`),
    enabled: leadId != null,
  });
}

export function useConsignments(filters: { leadId?: number; repId?: number; status?: "active" | "closed" } = {}, enabled = true) {
  return useQuery<ConsignmentWithRefs[]>({
    queryKey: ["/api/xpot/consignments", "list", filters],
    queryFn: () => getJson(`/api/xpot/consignments${qs(filters)}`),
    enabled,
  });
}

export function useConsignmentDetail(id: number | null) {
  return useQuery<ConsignmentDetail>({
    queryKey: ["/api/xpot/consignments", "one", id],
    queryFn: () => getJson(`/api/xpot/consignments/${id}`),
    enabled: id != null,
  });
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export type SaleItemInput = { productId?: number | null; description?: string; quantity: number; unitPriceCents?: number };

export type CreateSaleInput = {
  leadId: number;
  visitId?: number | null;
  items: SaleItemInput[];
  discountCents?: number;
  paymentStatus?: PaymentStatus;
  paymentMethod?: PaymentMethod | null;
  paidCents?: number;
  notes?: string | null;
};

export type DepositInput = {
  leadId: number;
  productId: number;
  quantity: number;
  unitPriceCents?: number;
  settlementIntervalDays?: number;
  visitId?: number | null;
  notes?: string | null;
};

export type SettleInput = {
  consignmentId: number;
  countedRemaining: number;
  restockQuantity?: number;
  unitPriceCents?: number;
  paymentStatus?: PaymentStatus;
  paymentMethod?: PaymentMethod | null;
  paidCents?: number;
  visitId?: number | null;
  notes?: string | null;
};

export type SettleResult = ConsignmentWithRefs & {
  settlement: SalesConsignmentMovement;
  restock: SalesConsignmentMovement | null;
  sale: SaleWithItems | null;
  soldQuantity: number;
  amountCents: number;
};

export function useSalesMutations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const t = useT(salesModuleMessages);

  const invalidateSales = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/sales"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/consignments"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/leads"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/dashboard"] }),
    ]);
  };

  const fail = (title: string) => (error: Error) => toast({ title, description: error.message, variant: "destructive" });

  const createSale = useMutation({
    mutationFn: async (input: CreateSaleInput) => (await apiRequest("POST", "/api/xpot/sales", input)).json() as Promise<SaleWithItems>,
    onSuccess: async () => { toast({ title: t("toastSaleRecorded"), variant: "success" }); await invalidateSales(); },
    onError: fail(t("toastSaleRecordFailed")),
  });

  const cancelSale = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason?: string }) =>
      (await apiRequest("POST", `/api/xpot/sales/${id}/cancel`, { reason })).json() as Promise<SaleWithItems>,
    onSuccess: async () => { toast({ title: t("toastSaleCancelled") }); await invalidateSales(); },
    onError: fail(t("toastSaleCancelFailed")),
  });

  const updatePayment = useMutation({
    mutationFn: async ({ id, ...body }: { id: number; paymentStatus?: PaymentStatus; paymentMethod?: PaymentMethod | null; paidCents?: number }) =>
      (await apiRequest("PATCH", `/api/xpot/sales/${id}/payment`, body)).json() as Promise<SaleWithItems>,
    onSuccess: async () => { toast({ title: t("toastPaymentUpdated"), variant: "success" }); await invalidateSales(); },
    onError: fail(t("toastPaymentUpdateFailed")),
  });

  const deposit = useMutation({
    mutationFn: async (input: DepositInput) =>
      (await apiRequest("POST", "/api/xpot/consignments/deposit", input)).json() as Promise<ConsignmentWithRefs & { opened: boolean }>,
    onSuccess: async (data) => {
      toast({
        title: data.opened ? t("toastConsignmentOpened") : t("toastStockAdded"),
        description: t("onShelfN", { count: data.consignment.quantityOnHand }),
        variant: "success",
      });
      await invalidateSales();
    },
    onError: fail(t("toastDepositFailed")),
  });

  const settle = useMutation({
    mutationFn: async ({ consignmentId, ...body }: SettleInput) =>
      (await apiRequest("POST", `/api/xpot/consignments/${consignmentId}/settle`, body)).json() as Promise<SettleResult>,
    onSuccess: async (data) => {
      toast({
        title: data.soldQuantity > 0 ? t("toastSettledSold", { count: data.soldQuantity }) : t("toastSettledNothing"),
        description: data.soldQuantity > 0
          ? t("toastBilled", { amount: formatCents(data.amountCents, data.consignment.currency) })
          : undefined,
        variant: "success",
      });
      await invalidateSales();
    },
    onError: fail(t("toastSettleFailed")),
  });

  const returnStock = useMutation({
    mutationFn: async ({ consignmentId, ...body }: { consignmentId: number; quantity: number; close?: boolean; visitId?: number | null; notes?: string | null }) =>
      (await apiRequest("POST", `/api/xpot/consignments/${consignmentId}/return`, body)).json() as Promise<ConsignmentWithRefs>,
    onSuccess: async () => { toast({ title: t("toastStockReturned"), variant: "success" }); await invalidateSales(); },
    onError: fail(t("toastReturnFailed")),
  });

  const adjust = useMutation({
    mutationFn: async ({ consignmentId, ...body }: { consignmentId: number; delta: number; visitId?: number | null; notes?: string | null }) =>
      (await apiRequest("POST", `/api/xpot/consignments/${consignmentId}/adjust`, body)).json() as Promise<ConsignmentWithRefs>,
    onSuccess: async () => { toast({ title: t("toastStockAdjusted"), variant: "success" }); await invalidateSales(); },
    onError: fail(t("toastAdjustFailed")),
  });

  const closeConsignment = useMutation({
    mutationFn: async (consignmentId: number) =>
      (await apiRequest("POST", `/api/xpot/consignments/${consignmentId}/close`, {})).json() as Promise<ConsignmentWithRefs>,
    onSuccess: async () => { toast({ title: t("toastConsignmentClosed") }); await invalidateSales(); },
    onError: fail(t("toastCloseFailed")),
  });

  const updateConsignment = useMutation({
    mutationFn: async ({ consignmentId, ...body }: { consignmentId: number; unitPriceCents?: number; settlementIntervalDays?: number; nextVisitDueAt?: string | null; notes?: string | null }) =>
      (await apiRequest("PATCH", `/api/xpot/consignments/${consignmentId}`, body)).json() as Promise<ConsignmentWithRefs>,
    onSuccess: async () => { toast({ title: t("toastConsignmentUpdated"), variant: "success" }); await invalidateSales(); },
    onError: fail(t("couldNotUpdate")),
  });

  return { createSale, cancelSale, updatePayment, deposit, settle, returnStock, adjust, closeConsignment, updateConsignment, invalidateSales };
}

export type ProductInput = {
  sku?: string | null;
  name: string;
  description?: string | null;
  kind?: "digital" | "physical";
  category?: string | null;
  unitLabel?: string;
  basePriceCents?: number;
  suggestedRetailCents?: number | null;
  costCents?: number | null;
  currency?: string;
  consignable?: boolean;
  isActive?: boolean;
  sortOrder?: number;
};

export function useProductMutations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const t = useT(salesModuleMessages);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/xpot/products"] });
  const fail = (title: string) => (error: Error) => toast({ title, description: error.message, variant: "destructive" });

  const create = useMutation({
    mutationFn: async (input: ProductInput) => (await apiRequest("POST", "/api/xpot/products", input)).json() as Promise<ProductWithTiers>,
    onSuccess: async () => { toast({ title: t("toastProductCreated"), variant: "success" }); await invalidate(); },
    onError: fail(t("toastProductCreateFailed")),
  });
  const update = useMutation({
    mutationFn: async ({ id, ...input }: Partial<ProductInput> & { id: number }) =>
      (await apiRequest("PATCH", `/api/xpot/products/${id}`, input)).json() as Promise<ProductWithTiers>,
    onSuccess: async () => { toast({ title: t("toastProductSaved"), variant: "success" }); await invalidate(); },
    onError: fail(t("toastProductSaveFailed")),
  });
  const remove = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/xpot/products/${id}`); },
    onSuccess: async () => { toast({ title: t("toastProductArchived") }); await invalidate(); },
    onError: fail(t("toastProductArchiveFailed")),
  });
  const replaceTiers = useMutation({
    mutationFn: async ({ id, tiers }: { id: number; tiers: { label?: string | null; minQuantity: number; unitPriceCents: number }[] }) =>
      (await apiRequest("PUT", `/api/xpot/products/${id}/tiers`, { tiers })).json() as Promise<SalesProductPriceTier[]>,
    onSuccess: async () => { toast({ title: t("toastPricingSaved"), variant: "success" }); await invalidate(); },
    onError: fail(t("toastPricingSaveFailed")),
  });

  return { create, update, remove, replaceTiers };
}
