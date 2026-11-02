import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { tagsMessages } from "@/i18n/messages/tags";
import { ErrorState } from "@/components/xpot/EmptyState";
import { ListSkeleton } from "@/components/xpot/ListSkeleton";
import { APP_BASE, errorText } from "./lib";
import { ScansSection, TopLists, useTagsDashboard } from "./TagsDashboard";
import { TopBar } from "./ui";

/** What the reseller's pieces did in the last 30 days: scans over time, the pieces and the customers scanned most. A report, one link from Home. */
export default function TagsResults() {
  const t = useT(tagsMessages);
  const tc = useT(commonMessages);
  const { data, isLoading, error, refetch } = useTagsDashboard();
  return (
    <div className="space-y-5" data-testid="tags-results">
      <div className="lg:hidden">
        <TopBar title={t("resultsTitle")} back={APP_BASE} />
      </div>
      {isLoading ? (
        <ListSkeleton rows={3} rowClassName="h-32 rounded-2xl" />
      ) : error || !data ? (
        <ErrorState message={errorText(error, tc("requestFailed"))} onRetry={() => void refetch()} />
      ) : (
        <>
          <ScansSection data={data} />
          <TopLists data={data} />
        </>
      )}
    </div>
  );
}
