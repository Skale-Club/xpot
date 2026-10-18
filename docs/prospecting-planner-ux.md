# Prospecting planner UX and adaptive search

Status: simplified form, progress view, today's route and Visits handoff implemented.

## Product promise

The rep asks for a day of field prospecting, not a static list from one city. Xpot starts at the
chosen city, removes places that are not cold opportunities, measures whether the remaining stops
fill the available work period and expands only as far as necessary.

Example: the rep chooses Framingham for an eight-hour day. If eligible businesses in Framingham
produce only four useful visits, Xpot searches the next geographically coherent area and appends
stops without creating a zig-zag route. It stops expanding when the route reaches the requested
amount of work needed for a useful day. These are planning estimates, not a rigid schedule.

## Planning form

The first screen stays compact while making the available field time explicit:

```text
┌─────────────────────────────────────────────┐
│ Onde você quer prospectar hoje?             │
│                                             │
│ Cidade             [ Framingham, MA       ] │
│ Setores            [ Barbearias          ] │
│                    [ Salões de beleza     ] │
│ Turno              [2h][4h][6h][8h][10h][12h]│
│                                             │
│          [ Buscar oportunidades ]           │
└─────────────────────────────────────────────┘
```

There is no date picker, visit target, average-duration field, expansion radius or
prospecting-mode selector. The route is always for today. The rep chooses a 2- to 12-hour shift;
Xpot keeps the 20-minute planning estimate per stop as internal guidance rather than presenting
appointments or deadlines. The sector field reports its five-sector limit instead of silently
discarding extra input.

Starting point is the device's current position. If location permission is unavailable, Xpot uses
the approximate center of the eligible places found in the chosen territory. The route is guidance:
a visit may take five minutes or an hour and
the rep can skip, reorder or stop at any moment.

## Search waves

```text
city selected
     |
     v
wave 0: base city -> normalize -> remove conflicts -> dry-run route
     | enough useful work for the internal full-day estimate?
     +------ yes ------> present route
     |
     no
     v
wave 1..N: widen depth / choose adjacent locality on route frontier
     |
     v
merge + dedupe -> dry-run route -> repeat until a stop condition
```

A wave is one sector search in one area. Searches remain sequential because the execution engine
has one slot. After every completed wave, Xpot recomputes route capacity instead of blindly
scraping every surrounding city.

### Expansion priority

1. Search the selected city with the requested sectors.
2. Increase coverage around the same anchor when Google Maps has more useful results.
3. Prefer a neighboring locality already appearing on the frontier of returned results.
4. If necessary, resolve adjacent localities around the anchor and score them by incremental drive,
   heading continuity, overlap with searched areas and distance from the configured end.
5. Add only the best next locality, recompute, and continue.

This incremental rule prevents a Framingham route from jumping east, west and east again merely
because each city independently contained high-scoring businesses.

### Stop conditions

Expansion stops automatically when any system condition is true:

- projected work is enough for the internal full-day guideline;
- the safety limit for travel growth has been reached;
- the last wave added no eligible candidates;
- configured maximum waves/cost has been reached;
- the rep cancels the planning job ("Cancel this search" on the Route screen, or the Xpot admin's
  "Cancel search" in Status). Its waiting and running searches become `cancelled` and are never
  sent or saved again; a route not built yet is marked failed, so the rep can start a new search
  (or rebuild the route of a finished one). The engine has no cancel in its API: Xpot stops
  waiting for it and drops whatever it still returns (`cancelProspectingJob`,
  `server/prospecting/queue.ts`).

The UI avoids false precision. It says “rota completa para hoje” or “rota mais curta — encontramos
8 locais elegíveis próximos”, while showing approximate drive time only as supporting information.

## Eligibility and conflict prevention

Identity is matched, strongest first, using Google Place ID, normalized phone and normalized
website domain. Address/name matching can be added as a lower-confidence review signal; it must
not silently discard a business because names are ambiguous.

Prospecting rules:

| Existing state in Xpot | Cold route behavior |
| --- | --- |
| Customer | Exclude: `existing_customer` |
| Lead/prospect with a recorded visit | Exclude: `previously_visited` |
| Lead/prospect never visited | Keep eligible and link the existing lead |
| No matching record | Create a new candidate |
| Duplicate returned in another wave | Merge by source identity |

Excluded businesses remain recorded on the discovery job for explainability but never enter route
optimization. The results screen shows counts and reasons without cluttering the map by default.

## Revisits belong to the CRM

The prospecting screen has no cold/warm choice. Prospecting means finding businesses not yet
visited. Existing customers, follow-ups, “come back later” outcomes and reactivation belong to a
separate CRM agenda/revisit experience. Keeping these jobs separate makes both screens easier to
understand and prevents customer appointments from being mixed into a discovery route.

## Planning screen after submission

The planner has four visible states, presented as one coarse progress stepper rather than false
precision:

1. **Search:** current area, sector, wave and progress for each physical search.
2. **Quality:** found, duplicate, existing-customer and previously-visited counts while the result
   set is normalized and expanded.
3. **Review:** ranked eligible businesses with score reasons and an exclusion breakdown. There is no
   selection step: Xpot automatically picks which eligible businesses fit the available time and
   orders them, and the screen says so (on phones too). The card shows the eligible count once and
   says whether the result is a "full route for today" or a "shorter route" (fewer eligible places
   than the shift needs). A finished search with no eligible place shows "No eligible places found"
   instead of a waiting message. The rep shapes the result on the route itself: remove a stop,
   drag to reorder, or skip it during the day.
4. **Route:** the resulting numbered map shows the stops coloured by state (current, next, planned,
   done, skipped) with a small legend, the rep's live position, a start marker when the route does
   not start at stop 1 and a home marker (plus a "Back home around HH:MM" row) when the route ends
   at home. The summary gives stops, approximate total time and distance in the app language.
   Publishing ("Use this route") sends the ordered stops to today's existing Visits view as planned
   visits; the planner is not a second agenda.

Notification permission is requested only from the visible “notify me when ready” action while a
job is running. Finishing discovery never triggers location or notification permissions on its own.

The rep should be able to leave the screen. The PostgreSQL-backed job continues and the same state
is available on another device.

## Backend contract represented in the schema

`prospecting_jobs` carries internal `target_stops`, `shift_duration_minutes`,
`default_visit_minutes`, `auto_expand`, `max_expansion_km` and an `expansion_state` document.
`prospecting_runs` carries `wave` and `expansion_reason`. `prospecting_candidates` carries
`exclusion_reason` and an optional link to the existing lead that caused the decision.

These values are system policy and are deliberately absent from the public mini-form contract.
The worker implements prospecting conflict filtering and up to two automatic expansion waves. It
first prefers a neighboring locality already visible in the candidate frontier; when none appears,
it broadens the anchor search. The implemented planner screen submits the two-field form, follows
the background job, builds today's route from current GPS, renders numbered stops and opens the
route in Google Maps.
