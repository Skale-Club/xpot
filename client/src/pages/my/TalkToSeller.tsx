import { useQuery } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { whatsappLinkFor } from "@shared/customerPanel";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { myPlatesMessages } from "@/i18n/messages/myPlates";
import { MY_KEYS, myApi } from "./api";

/**
 * "Talk to your seller": a WhatsApp chat with the person who holds the plates (one button per seller, for a customer
 * with more than one business), or with Xpot when a business has no seller to show. `businessName` narrows it to the
 * seller of one business.
 */
export function TalkToSeller({ businessName }: { businessName?: string }) {
  const t = useT(myPlatesMessages);
  const contact = useQuery({ queryKey: MY_KEYS.contact, queryFn: myApi.contact, staleTime: 5 * 60_000 });
  if (!contact.data) return null;

  const wanted = businessName ? contact.data.sellers.filter((s) => s.businessName === businessName) : contact.data.sellers;
  const sellers = (wanted.length ? wanted : contact.data.sellers).filter((s, i, all) => all.findIndex((o) => o.phone === s.phone) === i);
  const text = encodeURIComponent(t("whatsappText"));
  const buttons = sellers.flatMap((s) => {
    const link = whatsappLinkFor(s.phone);
    return link ? [{ key: s.phone, href: `${link}?text=${text}`, label: sellers.length > 1 ? t("talkSellerName", { name: s.name }) : t("talkSeller") }] : [];
  });
  if (!buttons.length) {
    const support = whatsappLinkFor(contact.data.support);
    if (support) buttons.push({ key: "support", href: `${support}?text=${text}`, label: t("talkSupport") });
  }
  if (!buttons.length) return null;

  return (
    <div className="space-y-2" data-testid="my-talk-seller">
      {buttons.map((b) => (
        <Button key={b.key} asChild variant="brand" accent="tags" size="lg" className="w-full">
          <a href={b.href} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="!size-5" />
            {b.label}
          </a>
        </Button>
      ))}
      <p className="px-1 text-center text-xs text-white/40">{t("readOnlyNote")}</p>
    </div>
  );
}
