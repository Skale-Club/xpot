import { useMemo } from "react";
import { TAG_BATCH_STATUSES, TAG_DESTINATION_TYPES, TAG_PRODUCT_TYPES, TAG_STATUSES } from "@shared/tags";
import { TAG_FACES } from "@shared/tagFace";
import { useT } from "@/i18n";
import { tagsMessages } from "@/i18n/messages/tags";
import { manageTagsMessages } from "@/i18n/messages/manageTags";

// Labels for the values a piece carries (product, destination, face, status, chip, scan event) and
// a batch's status, in the language in use. The piece, product and chip names come from the Tags
// app's dictionary so the management screens and the reseller's phone call things the same.

type Option = { value: string; label: string };

export function useTagLabels() {
  const tt = useT(tagsMessages);
  const t = useT(manageTagsMessages);
  return useMemo(() => {
    const lookup = (prefix: string, value: string | null | undefined, fallback = "—") => {
      if (!value) return fallback;
      const key = `${prefix}${value}`;
      const label = tt(key as never);
      return label === key ? value : label;
    };
    const product = (type: string | null | undefined) => lookup("product_", type);
    const destination = (type: string | null | undefined) => lookup("dest_", type);
    const face = (value: string | null | undefined) => lookup("face_", value, tt("face_none"));
    const status = (value: string | null | undefined) => lookup("status_", value);
    const chip = (value: string | null | undefined) => lookup("chip_", value);
    const own = (prefix: string, value: string) => {
      const key = `${prefix}${value}`;
      const label = t(key as never);
      return label === key ? value.replace(/_/g, " ") : label;
    };
    const event = (type: string) => own("event_", type);
    const batchStatus = (value: string) => own("batchStatus_", value);
    const productOptions: Option[] = TAG_PRODUCT_TYPES.map((value) => ({ value, label: product(value) }));
    const destinationOptions: Option[] = TAG_DESTINATION_TYPES.map((value) => ({ value, label: destination(value) }));
    /** What can be printed on a piece; a picker's empty option means "use the batch's / product's". */
    const faceOptions: Option[] = TAG_FACES.map((value) => ({ value, label: face(value) }));
    const statusOptions: Option[] = TAG_STATUSES.map((value) => ({ value, label: status(value) }));
    const batchStatusOptions: Option[] = TAG_BATCH_STATUSES.map((value) => ({ value, label: batchStatus(value) }));
    /** A reseller in a picker, flagged when switched off. */
    const repOption = (r: { displayName: string; isActive: boolean }) => (r.isActive ? r.displayName : t("repOff", { name: r.displayName }));
    return {
      product,
      destination,
      face,
      status,
      chip,
      event,
      batchStatus,
      productOptions,
      destinationOptions,
      faceOptions,
      statusOptions,
      batchStatusOptions,
      repOption,
    };
  }, [tt, t]);
}

export type TagLabels = ReturnType<typeof useTagLabels>;
