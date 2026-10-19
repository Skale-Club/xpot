import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { tasksMessages } from "@/i18n/messages/tasks";
import type { FullSalesLead } from "../../types";
import { NewTaskDialog } from "./TaskForm";

/** "New task" on the company page: the shared task form with the company fixed. */
export function CompanyTaskButton({ lead }: { lead: FullSalesLead }) {
  const t = useT(tasksMessages);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" />
        {t("newTask")}
      </Button>
      <NewTaskDialog open={open} onOpenChange={setOpen} company={{ id: lead.id, name: lead.name }} />
    </>
  );
}
