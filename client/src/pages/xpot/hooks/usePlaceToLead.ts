import { useCallback } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { checkinMessages } from "@/i18n/messages/checkin";
import { parseAddress } from "../utils";
import { useXpotShared } from "./useXpotShared";
import { useLeads } from "./useLeads";
import type { FullSalesLead, GooglePlaceResult } from "../types";

/**
 * Turns a Google Places result into a customer to check in at: the saved
 * customer the search matched it to (filling in its Place ID and address when
 * they were missing), or an import. The import is safe to repeat: when the
 * place is already a company the search could not see, the server answers with
 * that company instead of a duplicate. Shared by the Dashboard search and the
 * check-in screen.
 */
export function usePlaceToLead() {
  const { toast } = useToast();
  const t = useT(checkinMessages);
  const { invalidateXpotData } = useXpotShared();
  // Only for its create mutation: no need to load the rep's whole company list.
  const { createLeadMutation } = useLeads(false);

  const resolvePlace = useCallback(async (place: GooglePlaceResult, existingLead?: FullSalesLead): Promise<{ id: number; name: string }> => {
    if (existingLead) {
      // Matched to Google: keep the Place ID so Tags can build its review link.
      if (!existingLead.googlePlaceId && place.placeId) {
        apiRequest("PATCH", `/api/xpot/leads/${existingLead.id}`, { googlePlaceId: place.placeId })
          .then(() => invalidateXpotData())
          .catch(() => {});
      }
      // If the existing lead has no address, save the one from Google Places.
      const hasAddress = existingLead.locations && existingLead.locations.length > 0 && existingLead.locations[0]?.addressLine1;
      if (!hasAddress && place.address) {
        const parsedAddress = parseAddress(place.address);
        apiRequest("PATCH", `/api/xpot/leads/${existingLead.id}/location`, {
          addressLine1: parsedAddress.addressLine1 || place.address,
          city: parsedAddress.city || undefined,
          state: parsedAddress.state || undefined,
          country: "US",
          lat: place.lat ?? undefined,
          lng: place.lng ?? undefined,
          geofenceRadiusMeters: 150,
        }).then(() => invalidateXpotData()).catch(() => {});
      }
      toast({ title: t("localLeadSelected"), description: existingLead.name, variant: "success" });
      return { id: existingLead.id, name: existingLead.name };
    }

    const parsedAddress = parseAddress(place.address);
    const createdLead = await createLeadMutation.mutateAsync({
      name: place.name,
      phone: place.phone || undefined,
      website: place.website || undefined,
      industry: place.primaryType || undefined,
      source: "google_places",
      status: "prospect",
      notes: `Imported from Google Places (${place.placeId})`,
      googlePlaceId: place.placeId,
      primaryLocation: {
        label: "Main",
        addressLine1: parsedAddress.addressLine1 || place.address,
        city: parsedAddress.city || undefined,
        state: parsedAddress.state || undefined,
        country: "US",
        lat: place.lat ?? undefined,
        lng: place.lng ?? undefined,
        geofenceRadiusMeters: 150,
        isPrimary: true,
      },
    });
    const alreadySaved = (createdLead as { existing?: boolean }).existing === true;
    toast({ title: t(alreadySaved ? "localLeadSelected" : "businessImported"), description: createdLead.lead.name, variant: "success" });
    await invalidateXpotData();
    return { id: createdLead.lead.id, name: createdLead.lead.name };
  }, [createLeadMutation, invalidateXpotData, t, toast]);

  return { resolvePlace, isResolving: createLeadMutation.isPending };
}
