import { describe, expect, it } from "vitest";
import { isFinishedVisitStatus, VISIT_OUTCOME_STATUSES } from "../shared/visit-status.js";
import { salesVisitStatusEnum } from "../shared/schema.js";

describe("isFinishedVisitStatus", () => {
  it("counts every checked-out outcome as finished, not only 'completed'", () => {
    for (const status of ["sale_made", "follow_up", "came_back_later", "no_answer", "not_interested", "completed"]) {
      expect(isFinishedVisitStatus(status)).toBe(true);
    }
  });

  it("leaves out visits that are not finished", () => {
    for (const status of ["planned", "in_progress", "cancelled", "invalid", null, undefined, ""]) {
      expect(isFinishedVisitStatus(status)).toBe(false);
    }
  });

  it("only lists statuses the database knows", () => {
    for (const status of VISIT_OUTCOME_STATUSES) expect(salesVisitStatusEnum.enumValues).toContain(status);
  });
});
