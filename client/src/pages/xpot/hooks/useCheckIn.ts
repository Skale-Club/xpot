import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ApiError, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { translate, useT } from "@/i18n";
import { visitsMessages } from "@/i18n/messages/visits";
import { checkinMessages } from "@/i18n/messages/checkin";
import { formatMeters } from "../utils";
import { useXpotShared } from "./useXpotShared";
import { useXpotQueries } from "./useXpotQueries";
import { useLeads } from "./useLeads";
import { useVisits } from "./useVisits";
import { usePlaceToLead } from "./usePlaceToLead";
import type { GeofenceMiss } from "../components/CheckInOverrideDialog";
import type { GooglePlaceResult, FullSalesLead, SalesVisitNote } from "../types";

type CheckInInput = { leadId: number; lat?: number; lng?: number; gpsAccuracyMeters?: number | null; manualOverrideReason?: string };

/** The fields the server sends with a 400 outside_geofence (server/routes/xpot/visits.ts). */
function readGeofenceMiss(error: unknown): (GeofenceMiss & { overrideAllowed: boolean }) | null {
  if (!(error instanceof ApiError) || !error.body || typeof error.body !== "object") return null;
  const body = error.body as Record<string, unknown>;
  if (body.code !== "outside_geofence") return null;
  return {
    distanceMeters: Number(body.distanceMeters) || 0,
    allowedRadiusMeters: Number(body.allowedRadiusMeters) || 0,
    accuracyMeters: typeof body.accuracyMeters === "number" ? body.accuracyMeters : null,
    overrideAllowed: body.overrideAllowed === true,
  };
}

// Base64 adds a third; 3 MB raw stays under the platform's 4.5 MB request cap.
const MAX_AUDIO_BYTES = 3 * 1024 * 1024;

export function useCheckIn() {
  const { toast } = useToast();
  const t = useT(checkinMessages);
  const { invalidateXpotData } = useXpotShared();
  const { isOnline } = useXpotQueries();
  const { leadsQuery, createLeadMutation } = useLeads();
  const { activeVisit, checkingInRef } = useVisits();

  const [selectedLeadId, setSelectedLeadId] = useState<number | "">("");
  const [plannedVisitId, setPlannedVisitId] = useState<number | null>(null);
  const [checkInSearch, setCheckInSearch] = useState("");
  const [checkInDropdownOpen, setCheckInDropdownOpen] = useState(false);
  // Set when a check-in needs a reason before it can go through: outside the
  // radius (miss) or with no location at all (miss null).
  const [overridePrompt, setOverridePrompt] = useState<{ input: CheckInInput; miss: GeofenceMiss | null } | null>(null);
  const { resolvePlace } = usePlaceToLead();

  // Pre-select lead from URL query param ?leadId=
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const leadId = params.get("leadId");
    const visitId = Number(params.get("visitId"));
    setPlannedVisitId(Number.isInteger(visitId) && visitId > 0 ? visitId : null);
    if (!leadId || !leadsQuery.data) return;
    const lead = leadsQuery.data.find((l) => l.id === Number(leadId));
    if (lead) {
      setSelectedLeadId(lead.id);
      setCheckInSearch(lead.name);
    }
  }, [leadsQuery.data]);

  const selectedLead = useMemo(
    () => (typeof selectedLeadId === "number" ? leadsQuery.data?.find((lead) => lead.id === selectedLeadId) || null : null),
    [leadsQuery.data, selectedLeadId],
  );

  const checkInMutation = useMutation({
    mutationFn: async (input: CheckInInput) => {
      if (!isOnline) throw new Error(t("offlineError"));
      checkingInRef.current = true;
      const plannedLeadId = Number(new URLSearchParams(window.location.search).get("leadId"));
      const response = await apiRequest("POST", "/api/xpot/visits/check-in", {
        ...input,
        ...(plannedVisitId && plannedLeadId === input.leadId ? { visitId: plannedVisitId } : {}),
      });
      return response.json();
    },
    onSuccess: async () => {
      toast({ title: t("checkedIn"), variant: "success" });
      setPlannedVisitId(null);
      setOverridePrompt(null);
      await invalidateXpotData();
      setTimeout(() => { checkingInRef.current = false; }, 2000);
    },
    onError: (error: Error, input) => {
      checkingInRef.current = false;
      const miss = readGeofenceMiss(error);
      if (miss?.overrideAllowed && !input.manualOverrideReason) {
        // Not a failure the rep has to fix by walking: ask why, then retry.
        setOverridePrompt({ input, miss });
        return;
      }
      toast({
        title: t("checkInFailed"),
        description: miss ? t("outsideFenceBlocked", { distance: formatMeters(miss.distanceMeters), radius: formatMeters(miss.allowedRadiusMeters) }) : error.message,
        variant: "destructive",
      });
    },
  });

  // The check-in screen records with VoiceRecorder and passes its blob.
  const uploadAudioMutation = useMutation({
    mutationFn: async (recording: { audioBlob: Blob; durationSeconds: number }) => {
      const blob = recording.audioBlob;
      const seconds = recording.durationSeconds;
      if (!activeVisit?.id) return;
      if (blob.size > MAX_AUDIO_BYTES) {
        throw new Error(translate(visitsMessages, "recordingTooLargeDesc"));
      }
      const reader = new FileReader();
      const audioData = await new Promise<string>((resolve) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });

      const response = await apiRequest("POST", `/api/xpot/visits/${activeVisit.id}/audio`, {
        audioData,
        durationSeconds: seconds,
      });
      const uploaded = await response.json() as {
        note: SalesVisitNote;
        transcriptionAvailable: boolean;
        readyToAnalyze: boolean;
      };

      // Step two, now a separate request: read the transcript against the
      // catalog and this shop's stock, and propose what to record.
      if (!uploaded.readyToAnalyze) return { ...uploaded, analysisApplied: false, actionCount: 0, visitStatus: null };
      try {
        const analyzed = await apiRequest("POST", `/api/xpot/visits/${activeVisit.id}/analyze`, {});
        const result = await analyzed.json() as { actions: unknown[]; visitStatus: string | null };
        return {
          ...uploaded,
          analysisApplied: true,
          actionCount: result.actions?.length ?? 0,
          // The outcome the model heard ("nobody was there") — offered to the
          // check-out picker, never applied on its own.
          visitStatus: result.visitStatus ?? null,
        };
      } catch {
        // The note and its transcript are already saved; analysis can be
        // retried without re-recording, so this is not a failed upload.
        return { ...uploaded, analysisApplied: false, actionCount: 0, visitStatus: null };
      }
    },
    onSuccess: async (result) => {
      const count = result?.actionCount ?? 0;
      toast({
        title: count > 0
          ? t.plural("actionsDetected", count)
          : result?.analysisApplied
            ? t("noteAnalyzed")
            : t("audioUploaded"),
        description: count > 0
          ? t("actionsReviewBefore")
          : result?.transcriptionAvailable
            ? t("audioTranscribedDesc")
            : t("audioSavedDesc"),
        variant: "success",
      });
      await invalidateXpotData();
    },
    onError: (error: Error) => {
      toast({ title: t("audioUploadFailed"), description: error.message, variant: "destructive" });
    },
  });

  const pickLocalLeadForCheckIn = (lead: FullSalesLead) => {
    setSelectedLeadId(lead.id);
    setCheckInSearch(lead.name);
  };

  const pickGooglePlaceForCheckIn = async (place: GooglePlaceResult) => {
    const lead = await resolvePlace(place);
    setSelectedLeadId(lead.id);
    setCheckInSearch(lead.name);
  };

  /** Retry the check-in the server refused, now with the rep's reason. */
  const confirmOverride = (reason: string) => {
    if (!overridePrompt) return;
    checkInMutation.mutate({ ...overridePrompt.input, manualOverrideReason: reason });
  };

  return {
    selectedLeadId,
    setSelectedLeadId,
    selectedLead,
    checkInSearch,
    setCheckInSearch,
    checkInDropdownOpen,
    setCheckInDropdownOpen,
    checkInMutation,
    createLeadMutation,
    pickLocalLeadForCheckIn,
    pickGooglePlaceForCheckIn,
    overridePrompt,
    setOverridePrompt,
    confirmOverride,
    uploadAudioMutation,
  };
}
