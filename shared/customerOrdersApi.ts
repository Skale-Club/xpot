// JSON contract shared by the order screens. No acquisition costs are exposed here.
export interface OrderArtwork {
  id: string;
  revision: number;
  kind: string;
  description: string;
  hasFile: boolean;
  filename: string | null;
  status: string;
  approvedBy: string | null;
  approvalMethod: string | null;
  createdAt: string;
}
export interface OrderUnit {
  id: string;
  tagId: string;
  publicCode: string;
  state: string;
  repId: number | null;
  organizationId: number;
  deliveryId: string | null;
}
export interface OrderLine {
  id: string;
  sequence: number;
  quantity: number;
  cancelledQuantity: number;
  description: string;
  salesProductId: number;
  productType: string;
  face: string;
  theme: string | null;
  unitPriceCents?: number;
  producerOrganizationId: number;
  modelId: string | null;
  modelSlug: string | null;
  plateCapacity?: number;
  versionId: string | null;
  custom: string;
  delivered: number;
  allocated: number;
  pending: number;
  remaining: number;
  ready: number;
  toProduce: number;
  approved: boolean;
  units: OrderUnit[];
  artwork: OrderArtwork[];
  production: Array<{
    id: string;
    quantity: number;
    status: string;
    modelTitle: string;
  }>;
}
export interface OrderPayment {
  id: string;
  kind: string;
  amountCents: number;
  reason: string;
  referenceId: string | null;
  createdAt: string;
}
export interface OrderDelivery {
  id: string;
  saleId: number;
  status: string;
  totalCents: number;
  paidCents: number;
  paymentStatus: string;
  createdAt: string;
}
export interface CustomerOrder {
  id: string;
  organizationId: number;
  leadId: number;
  repId: number;
  visitId: number | null;
  opportunityId: number | null;
  currency: string;
  status: string;
  revision: number;
  notes: string | null;
  createdAt: string;
  customerName: string;
  sellerName: string;
  sellerActive: boolean;
  sellerView: boolean;
  canManage: boolean;
  canDesign: boolean;
  canProduce: boolean;
  workState: string;
  lines: OrderLine[];
  payments: OrderPayment[];
  deliveries: OrderDelivery[];
  events: Array<{
    id: string;
    action: string;
    detail: Record<string, unknown>;
    createdAt: string;
  }>;
  creditCents?: number;
  totalCents?: number;
}
export interface OrderPage {
  items: CustomerOrder[];
  total: number;
  nextOffset: number | null;
}
export interface OrderCatalogModel {
  id: string;
  title: string;
  productType: string;
  face: string;
  theme: string | null;
  salesProductId: number;
  unitPriceCents: number;
  currency: string;
}
export interface OrderCatalog {
  models: OrderCatalogModel[];
  products: Array<{
    id: number;
    name: string;
    currency: string;
    basePriceCents: number;
  }>;
  producers: Array<{
    id: number;
    name: string;
    sellerOrganizationIds: number[];
  }>;
}
