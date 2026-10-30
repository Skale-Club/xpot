import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppLoader } from "@/components/ui/spinner";
import { workspaceForPath } from "@/lib/workspace";
import { clearWorkspaceQueries } from "@/lib/workspaceQueries";

/** Unmount the old workspace and clear scoped data before the new screens can query. */
export function WorkspaceBoundary({ children }: { children: ReactNode }) {
  const [path] = useLocation();
  const target = workspaceForPath(path);
  const [scope, setScope] = useState(target);
  const client = useQueryClient();
  useEffect(() => {
    if (scope === target) return;
    let active = true;
    void clearWorkspaceQueries(client).then(() => { if (active) setScope(target); });
    return () => { active = false; };
  }, [scope, target, client]);
  return scope === target ? children : <AppLoader />;
}
