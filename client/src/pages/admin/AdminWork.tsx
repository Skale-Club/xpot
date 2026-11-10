import { screens } from "@/lib/screens";
import { Redirect, Route, Router, Switch } from "wouter";
import { GeoProvider } from "@/pages/xpot/hooks/GeoProvider";
import { useXpotModules } from "@/components/ModuleSwitch";

const { leads: Leads, tasks: Tasks, sales: Sales, dashboard: Dashboard, checkIn: CheckIn,
  tagsCustomers: Customers, tagsCustomer: Customer, tagsPieces: Pieces, tagsPiece: Piece } = screens;

/** Existing team tools keep their navigation inside the management panel. */
export function AdminWork() {
  const modules = useXpotModules();
  return <Router base="/admin/work"><GeoProvider><Switch>
    {modules.includes("visits") ? <Route path="/leads/*?" component={Leads} /> : null}
    {modules.includes("visits") ? <Route path="/tasks" component={Tasks} /> : null}
    {modules.includes("visits") ? <Route path="/sales/*?" component={Sales} /> : null}
    {modules.includes("visits") ? <Route path="/dashboard/*?" component={Dashboard} /> : null}
    {modules.includes("visits") ? <Route path="/route/check-in" component={CheckIn} /> : null}
    {modules.includes("tags") ? <Route path="/tags/customers/:id">{({ id }) => <Customer leadId={Number(id)} />}</Route> : null}
    {modules.includes("tags") ? <Route path="/tags/customers" component={Customers} /> : null}
    {modules.includes("tags") ? <Route path="/tags/pieces/:code">{({ code }) => <Piece code={code} />}</Route> : null}
    {modules.includes("tags") ? <Route path="/tags/t/:code">{({ code }) => <Piece code={code} />}</Route> : null}
    {modules.includes("tags") ? <Route path="/tags/pieces"><Pieces /></Route> : null}
    <Route><Redirect to={modules.includes("visits") ? "/leads" : "/tags/customers"} /></Route>
  </Switch></GeoProvider></Router>;
}
