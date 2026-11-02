import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { PAGE_GRADIENT } from "@/components/xpot/surface";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";

/** A wrong address (an old link, a typo): says so, instead of opening the sign-in page as if nothing happened. */
export default function NotFound() {
  const t = useT(commonMessages);
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 px-6 text-center text-white" style={{ background: PAGE_GRADIENT }} data-testid="not-found">
      <p className="text-lg font-semibold">{t("notFoundTitle")}</p>
      <Button asChild variant="secondary">
        <Link href="/">{t("goHome")}</Link>
      </Button>
    </div>
  );
}
