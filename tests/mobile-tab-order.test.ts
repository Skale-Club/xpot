import { describe, expect, it } from "vitest";
import { Activity, Building2, Package } from "lucide-react";
import { orderMobileTabs, type MobileTab } from "../client/src/components/xpot/MobileTabBar";

const tab = (id: string): MobileTab => ({ id, label: id, icon: Activity });

describe("orderMobileTabs", () => {
  it("keeps the Visits dashboard first", () => {
    const tabs = [tab("leads"), tab("sales"), { id: "dashboard", label: "Dashboard", icon: Building2 }];
    expect(orderMobileTabs(tabs, "visits").map((item) => item.id)).toEqual(["dashboard", "leads", "sales"]);
  });

  it("keeps the Tags dashboard first", () => {
    const tabs = [tab("/tags/customers"), { id: "/tags", label: "Dashboard", icon: Package }, tab("/tags/pieces")];
    expect(orderMobileTabs(tabs, "tags").map((item) => item.id)).toEqual(["/tags", "/tags/customers", "/tags/pieces"]);
  });
});
