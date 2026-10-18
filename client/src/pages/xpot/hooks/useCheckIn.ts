import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ApiError, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { checkinMessages } from "@/i18n/messages/checkin";
import { formatMeters } from "../utils";
import { useXpotShared } from "./useXpotShared";
import { useXpotQueries } from "./useXpotQueries";
import { useLeads } from "./useLeads";
import { useVisits } from "./useVisits";
import { usePlaceToLead } from "./usePlaceToLead";
import type { GeofenceMiss } from "../components/CheckInOverrideDialog";
import type { GooglePlaceResult, FullSalesLead, SalesLeadPayload, SalesVisitNote } from "../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMutation = ReturnType<typeof useMutation<any, any, any, any>>;

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
  const [visitNoteForm, setVisitNoteForm] = useState({ summary: "", outcome: "", nextStep: "", followUpRequired: false });
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const selectedLead = useMemo(
    () => (typeof selectedLeadId === "number" ? leadsQuery.data?.find((lead) => lead.id === selectedLeadId) || null : null),
    [leadsQuery.data, selectedLeadId],
  );

  useEffect(() => {
    if (activeVisit?.note) {
      setVisitNoteForm({
        summary: activeVisit.note.summary || "",
        outcome: activeVisit.note.outcome || "",
        nextStep: activeVisit.note.nextStep || "",
        followUpRequired: Boolean(activeVisit.note.followUpRequired),
      });
    }
  }, [activeVisit?.id, activeVisit?.note]);

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

  const saveNoteMutation = useMutation({
    mutationFn: async () => {
      if (!activeVisit?.id) throw new Error(t("noActiveVisitNote"));
      const response = await apiRequest("PATCH", `/api/xpot/visits/${activeVisit.id}/note`, visitNoteForm);
      return response.json();
    },
    onSuccess: async () => {
      toast({ title: t("noteSaved"), variant: "success" });
      await invalidateXpotData();
    },
    onError: (error: Error) => {
      toast({ title: t("noteSaveFailed"), description: error.message, variant: "destructive" });
    },
  });

  const uploadAudioMutation = useMutation({
    mutationFn: async () => {
      if (!audioBlob || !activeVisit?.id) return;
      if (audioBlob.size > MAX_AUDIO_BYTES) {
        throw new Error("That recording is too large to send. Keep voice notes under five minutes.");
      }
      const reader = new FileReader();
      const audioData = await new Promise<string>((resolve) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(audioBlob);
      });

      const response = await apiRequest("POST", `/api/xpot/visits/${activeVisit.id}/audio`, {
        audioData,
        durationSeconds: recordingTime,
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
      setAudioBlob(null);
      setRecordingTime(0);
      await invalidateXpotData();
    },
    onError: (error: Error) => {
      toast({ title: t("audioUploadFailed"), description: error.message, variant: "destructive" });
    },
  });

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        audioBitsPerSecond: 32_000,
        ...(typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? { mimeType: "audio/webm;codecs=opus" }
          : {}),
      });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      const interval = setInterval(() => {
        setRecordingTime((prev) => {
          if (prev >= 300) { stopRecording(); return prev; }
          return prev + 1;
        });
      }, 1000);

      (mediaRecorder as any).intervalId = interval;
    } catch (error) {
      toast({ title: t("recordStartFailed"), description: t("grantMic"), variant: "destructive" });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      const intervalId = (mediaRecorderRef.current as any).intervalId;
      clearInterval(intervalId);
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

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

  const createNewCompanyFromSearch = async () => {
    const name = checkInSearch.trim();
    if (!name) return;

    const createdLead = await createLeadMutation.mutateAsync({
      name,
      source: "manual",
      status: "prospect",
      notes: "Created manually during check-in",
      // No address to send: the empty addressLine1 this used to pass failed
      // validation, and the server skips the location row without one anyway.
    });

    setSelectedLeadId(createdLead.lead.id);
    setCheckInSearch(createdLead.lead.name);
    setCheckInDropdownOpen(false);
    toast({ title: t("companyCreated"), description: createdLead.lead.name, variant: "success" });
    await invalidateXpotData();
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
    createNewCompanyFromSearch,
    overridePrompt,
    setOverridePrompt,
    confirmOverride,
    visitNoteForm,
    setVisitNoteForm,
    isRecording,
    recordingTime,
    audioBlob,
    setAudioBlob,
    setRecordingTime,
    startRecording,
    stopRecording,
    uploadAudioMutation,
    saveNoteMutation,
  };
}
