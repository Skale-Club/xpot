import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePlaceSearch } from "../usePlaceSearch";
import { findMatchingLead, parseAddress } from "../utils";
import { useXpotShared } from "./useXpotShared";
import { useXpotQueries } from "./useXpotQueries";
import { useLeads } from "./useLeads";
import { useVisits } from "./useVisits";
import type { GooglePlaceResult, FullSalesLead, SalesLeadPayload, SalesVisitNote } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMutation = ReturnType<typeof useMutation<any, any, any, any>>;

export function useCheckIn() {
  const { toast } = useToast();
  const { geoState, invalidateXpotData } = useXpotShared();
  const { xpotMeQuery, activeTab, isOnline } = useXpotQueries();
  const { leadsQuery, createLeadMutation } = useLeads();
  const { activeVisit, checkingInRef } = useVisits();

  const [selectedLeadId, setSelectedLeadId] = useState<number | "">("");
  const [checkInSearch, setCheckInSearch] = useState("");
  const [checkInDropdownOpen, setCheckInDropdownOpen] = useState(false);

  // Pre-select lead from URL query param ?leadId=
  useEffect(() => {
    if (activeTab !== "check-in") return;
    const params = new URLSearchParams(window.location.search);
    const leadId = params.get("leadId");
    if (!leadId || !leadsQuery.data) return;
    const lead = leadsQuery.data.find((l) => l.id === Number(leadId));
    if (lead) {
      setSelectedLeadId(lead.id);
      setCheckInSearch(lead.name);
    }
  }, [activeTab, leadsQuery.data]);
  const [visitNoteForm, setVisitNoteForm] = useState({ summary: "", outcome: "", nextStep: "", followUpRequired: false });
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const checkInPlaceQuery = usePlaceSearch(checkInSearch, xpotMeQuery.isSuccess && activeTab === "check-in", geoState);

  const selectedLead = useMemo(
    () => (typeof selectedLeadId === "number" ? leadsQuery.data?.find((lead) => lead.id === selectedLeadId) || null : null),
    [leadsQuery.data, selectedLeadId],
  );

  const filteredLeadsForCheckIn = useMemo(() => {
    const search = checkInSearch.trim().toLowerCase();
    if (!search) return (leadsQuery.data || []).slice(0, 6);

    return (leadsQuery.data || []).filter((lead) => {
      const haystack = [
        lead.name,
        lead.industry,
        lead.phone,
        lead.email,
        lead.locations?.map((location) => `${location.addressLine1} ${location.city || ""} ${location.state || ""}`).join(" "),
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(search);
    }).slice(0, 6);
  }, [leadsQuery.data, checkInSearch]);

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
    mutationFn: async (input: { leadId: number; lat?: number; lng?: number; gpsAccuracyMeters?: number | null }) => {
      if (!isOnline) throw new Error("You are offline. Please check your connection.");
      checkingInRef.current = true;
      const response = await apiRequest("POST", "/api/xpot/visits/check-in", input);
      return response.json();
    },
    onSuccess: async () => {
      toast({ title: "Checked in successfully", variant: "success" });
      await invalidateXpotData();
      setTimeout(() => { checkingInRef.current = false; }, 2000);
    },
    onError: (error: Error) => {
      checkingInRef.current = false;
      toast({ title: "Check-in failed", description: error.message, variant: "destructive" });
    },
  });

  const saveNoteMutation = useMutation({
    mutationFn: async () => {
      if (!activeVisit?.id) throw new Error("No active visit to save note for.");
      const response = await apiRequest("PATCH", `/api/xpot/visits/${activeVisit.id}/note`, visitNoteForm);
      return response.json();
    },
    onSuccess: async () => {
      toast({ title: "Visit note saved", variant: "success" });
      await invalidateXpotData();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save note", description: error.message, variant: "destructive" });
    },
  });

  const uploadAudioMutation = useMutation({
    mutationFn: async () => {
      if (!audioBlob || !activeVisit?.id) return;
      const reader = new FileReader();
      const audioData = await new Promise<string>((resolve) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(audioBlob);
      });

      const response = await apiRequest("POST", `/api/xpot/visits/${activeVisit.id}/audio`, {
        audioData,
        durationSeconds: recordingTime,
      });
      return response.json() as Promise<{
        note: SalesVisitNote;
        transcriptionAvailable: boolean;
        analysisApplied: boolean;
      }>;
    },
    onSuccess: async (result) => {
      toast({
        title: result?.analysisApplied ? "Audio analyzed successfully" : "Audio uploaded successfully",
        description: result?.analysisApplied
          ? "The transcription was analyzed and the visit note was updated."
          : result?.transcriptionAvailable
            ? "The audio was transcribed and saved."
            : "The audio was saved.",
        variant: "success",
      });
      setAudioBlob(null);
      setRecordingTime(0);
      await invalidateXpotData();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to upload audio", description: error.message, variant: "destructive" });
    },
  });

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
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
      toast({ title: "Failed to start recording", description: "Please grant microphone permission", variant: "destructive" });
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
    const existingLead = findMatchingLead(place, leadsQuery.data || []);
    if (existingLead) {
      setSelectedLeadId(existingLead.id);
      setCheckInSearch(existingLead.name);
      // If the existing lead has no address, save the one from Google Places
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
      toast({ title: "Local lead selected", description: existingLead.name, variant: "success" });
      return;
    }

    const parsedAddress = parseAddress(place.address);
    const createdLead = await createLeadMutation.mutateAsync({
      name: place.name,
      phone: place.phone || undefined,
      website: place.website || undefined,
      industry: place.primaryType || undefined,
      source: "google_places",
      status: "lead",
      notes: `Imported from Google Places (${place.placeId})`,
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

    setSelectedLeadId(createdLead.lead.id);
    setCheckInSearch(place.name);
    toast({ title: "Business imported for check-in", description: place.name, variant: "success" });
    await invalidateXpotData();
  };

  const createNewCompanyFromSearch = async () => {
    const name = checkInSearch.trim();
    if (!name) return;

    const createdLead = await createLeadMutation.mutateAsync({
      name,
      source: "manual",
      status: "lead",
      notes: "Created manually during check-in",
      primaryLocation: {
        label: "Main",
        addressLine1: "",
        country: "US",
        lat: geoState.lat ?? undefined,
        lng: geoState.lng ?? undefined,
        geofenceRadiusMeters: 150,
        isPrimary: true,
      },
    });

    setSelectedLeadId(createdLead.lead.id);
    setCheckInSearch(createdLead.lead.name);
    setCheckInDropdownOpen(false);
    toast({ title: "Company created", description: createdLead.lead.name, variant: "success" });
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
    filteredLeadsForCheckIn,
    checkInPlaceQuery,
    checkInMutation,
    createLeadMutation,
    pickLocalLeadForCheckIn,
    pickGooglePlaceForCheckIn,
    createNewCompanyFromSearch,
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
