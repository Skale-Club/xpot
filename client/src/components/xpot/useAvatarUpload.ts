import { useRef, type ChangeEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { dashboardMessages } from "@/i18n/messages/dashboard";

/**
 * The profile photo upload, shared by the phone header's avatar, the desktop
 * sidebar's and Settings › Profile: a hidden file input to click, and the upload.
 *
 *   const avatar = useAvatarUpload();
 *   <button onClick={avatar.pick} disabled={avatar.pending}>…</button>
 *   <input {...avatar.inputProps} />
 */
export function useAvatarUpload() {
  const t = useT(dashboardMessages);
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const mutation = useMutation({
    mutationFn: async (imageData: string) => {
      const response = await apiRequest("POST", "/api/xpot/me/avatar", { imageData });
      return response.json() as Promise<{ avatarUrl: string }>;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/xpot/me"] });
      toast({ title: t("photoUpdated") });
    },
    onError: (error: Error) => toast({ title: t("uploadFailed"), description: error.message, variant: "destructive" }),
  });
  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => mutation.mutate(reader.result as string);
    reader.readAsDataURL(file);
    event.target.value = "";
  };
  return {
    pick: () => inputRef.current?.click(),
    pending: mutation.isPending,
    label: t("changePhoto"),
    inputProps: { ref: inputRef, type: "file", accept: "image/*", className: "hidden", onChange } as const,
  };
}
