import { useRef, useState } from "react";
import {
  Camera,
  X,
  Check,
} from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Loader2 } from '@/components/ui/loader';
import type { XpotMeResponse } from "./types";

interface Props {
  me: XpotMeResponse;
  onClose: () => void;
}

function maskPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits.length ? `(${digits}` : "";
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function XpotProfileEditor({ me, onClose }: Props) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(me.rep.displayName);
  const [phone, setPhone] = useState(me.rep.phone ?? "");
  const [avatarPreview, setAvatarPreview] = useState<string | undefined>(me.rep.avatarUrl ?? undefined);
  const [pendingImageData, setPendingImageData] = useState<string | undefined>(undefined);

  const avatarMutation = useMutation({
    mutationFn: async (imageData: string) => {
      const res = await apiRequest("POST", "/api/xpot/me/avatar", { imageData });
      return res.json() as Promise<{ avatarUrl: string }>;
    },
  });

  const profileMutation = useMutation({
    mutationFn: async (data: { displayName?: string; phone?: string; avatarUrl?: string }) => {
      const res = await apiRequest("PATCH", "/api/xpot/me", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/me"] });
      toast({ title: "Profile updated" });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update profile", description: err.message, variant: "destructive" });
    },
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const base64 = await toBase64(file);
    setAvatarPreview(base64);
    setPendingImageData(base64);
  };

  const handleSave = async () => {
    let avatarUrl: string | undefined;

    if (pendingImageData) {
      try {
        const result = await avatarMutation.mutateAsync(pendingImageData);
        avatarUrl = result.avatarUrl;
      } catch (err: any) {
        toast({ title: "Avatar upload failed", description: err.message, variant: "destructive" });
        return;
      }
    }

    const patch: { displayName?: string; phone?: string; avatarUrl?: string } = {};
    if (displayName !== me.rep.displayName) patch.displayName = displayName;
    if (phone !== (me.rep.phone ?? "")) patch.phone = phone;
    if (avatarUrl) patch.avatarUrl = avatarUrl;

    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }

    profileMutation.mutate(patch);
  };

  const initials = me.rep.displayName.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
  const isSaving = avatarMutation.isPending || profileMutation.isPending;

  return (
    <Dialog open={true} onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent
        className="max-w-sm rounded-3xl border-0 p-0 overflow-hidden [&>button]:hidden"
        style={{ background: "rgba(10, 15, 30, 0.97)", backdropFilter: "blur(24px)", boxShadow: "0 24px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.07)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <span className="text-base font-semibold text-white">Edit Profile</span>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/70 transition-colors touch-manipulation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 pb-6 space-y-6">
          {/* Avatar picker */}
          <div className="flex flex-col items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="group relative h-20 w-20 shrink-0 touch-manipulation"
            >
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  alt="Avatar"
                  className="h-20 w-20 rounded-[22px] object-cover"
                />
              ) : (
                <div
                  className="flex h-20 w-20 items-center justify-center rounded-[22px] text-2xl font-bold tracking-wide text-white"
                  style={{ background: "linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)" }}
                >
                  {initials}
                </div>
              )}
              <div className="absolute inset-0 flex items-center justify-center rounded-[22px] bg-black/50 opacity-0 transition-opacity group-hover:opacity-100 group-active:opacity-100">
                <Camera className="h-6 w-6 text-white" />
              </div>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors touch-manipulation"
            >
              Change photo
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {/* Fields */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                className="w-full rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3.5 text-[15px] font-medium text-white placeholder-white/20 outline-none focus:border-indigo-500/50 focus:bg-white/[0.05] transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                Phone
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(maskPhone(e.target.value))}
                placeholder="+1 (555) 000-0000"
                className="w-full rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3.5 text-[15px] font-medium text-white placeholder-white/20 outline-none focus:border-indigo-500/50 focus:bg-white/[0.05] transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                Role
              </label>
              <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3.5 text-[15px] font-medium text-white/30">
                {me.rep.role}
              </div>
            </div>
          </div>

          {/* Save */}
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !displayName.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 pt-4 text-sm font-bold text-white transition-all disabled:opacity-40 active:scale-[0.98] mt-2 touch-manipulation"
            style={{ background: isSaving ? "rgba(99,102,241,0.5)" : "linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)", boxShadow: "0 8px 24px rgba(99,102,241,0.25)" }}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin text-white" />
            ) : (
              <Check className="h-4 w-4 text-white" />
            )}
            <span>{isSaving ? "Saving…" : "Save Changes"}</span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
