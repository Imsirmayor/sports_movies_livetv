"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  SportCompetition,
  SportEvent,
  SportEventStatus,
  SportsListResponse,
} from "@frankenstein/shared-types";
import { SiteShell } from "./SiteShell";
import { EventCard } from "./EventCard";
import { SkeletonGrid, StateBlock } from "./StateBlock";
import { apiClient } from "@/lib/api-client";
import { isApiClientError } from "@/lib/api-error";

const STATUSES: Array<SportEventStatus | ""> = ["", "live", "upcoming", "finished", "unknown"];

type LeagueGroup = {
  key: string;
  name: string;
  sport: string;
  events: SportEvent[];
};

function groupByCompetition(
  events: SportEvent[],
  competitions: SportCompetition[]
): LeagueGroup[] {
  const order = new Map(competitions.map((c, i) => [c.id, i]));
  const byId = new Map<string, LeagueGroup>();

  for (const event of events) {
    const key = event.competitionId || event.competition || "other";
    const known = competitions.find((c) => c.id === key || c.name === event.competition);
    let group = byId.get(key);
    if (!group) {
      group = {
        key,
        name: known?.name ?? event.competition,
        sport: known?.sport ?? event.sport,
        events: [],
      };
      byId.set(key, group);
    }
    group.events.push(event);
  }

  return [...byId.values()].sort((a, b) => {
    const ai = order.get(a.key) ?? 999;
    const bi = order.get(b.key) ?? 999;
    if (ai !== bi) return ai - bi;
    return a.name.localeCompare(b.name);
  });
}

export function SportsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [catalog, setCatalog] = useState<SportsListResponse | null>(null);
  const [events, setEvents] = useState<SportEvent[]>([]);
  const [ambiguous, setAmbiguous] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filters = useMemo(
    () => ({
      q: params.get("q") ?? "",
      team: params.get("team") ?? "",
      sport: params.get("sport") ?? "",
      competition: params.get("competition") ?? "",
      status: (params.get("status") as SportEventStatus | null) ?? "",
    }),
    [params]
  );

  const leagues = useMemo(
    () => groupByCompetition(events, catalog?.competitions ?? []),
    [events, catalog]
  );

  useEffect(() => {
    let cancelled = false;
    async function loadCatalog() {
      try {
        const c = await apiClient.listSports();
        if (!cancelled) setCatalog(c);
      } catch {
        /* list can fail independently; events will show error */
      }
    }
    void loadCatalog();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadEvents() {
      setLoading(true);
      try {
        const status =
          filters.status === "live" ||
          filters.status === "upcoming" ||
          filters.status === "finished" ||
          filters.status === "unknown"
            ? filters.status
            : undefined;
        const res = await apiClient.searchSportsEvents({
          q: filters.q || undefined,
          team: filters.team || undefined,
          sport: filters.sport || undefined,
          competition: filters.competition || undefined,
          status,
        });
        if (!cancelled) {
          setEvents(res.events);
          setAmbiguous(Boolean(res.ambiguous));
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setEvents([]);
          setAmbiguous(false);
          setError(isApiClientError(err) ? err.message : "Failed to load events");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadEvents();
    return () => {
      cancelled = true;
    };
  }, [filters]);

  function updateQuery(patch: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (!v) next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    router.replace(qs ? `/sports?${qs}` : "/sports");
  }

  function selectLeague(name: string) {
    updateQuery({ competition: name === filters.competition ? "" : name });
  }

  return (
    <SiteShell searchHref="/sports" searchPlaceholder="Search teams or events">
      <div className="page-hero">
        <h1>Live sports</h1>
        <p>
          Matches grouped by league from the configured provider
          {catalog ? ` (${catalog.provider})` : ""}. Live video needs an authorized stream source —
          Sportsurge is offline, so fixture events are schedule-only (no local-file stand-in).
        </p>
      </div>

      {catalog && catalog.competitions.length > 0 ? (
        <div className="league-chips" role="navigation" aria-label="Leagues">
          <button
            type="button"
            className={`league-chip${!filters.competition ? " is-active" : ""}`}
            onClick={() => updateQuery({ competition: "" })}
          >
            All leagues
          </button>
          {catalog.competitions.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`league-chip${filters.competition === c.name ? " is-active" : ""}`}
              onClick={() => selectLeague(c.name)}
            >
              {c.name}
            </button>
          ))}
        </div>
      ) : null}

      <form
        className="filter-bar"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          updateQuery({
            q: String(fd.get("q") || ""),
            team: String(fd.get("team") || ""),
            sport: String(fd.get("sport") || ""),
            competition: String(fd.get("competition") || ""),
            status: String(fd.get("status") || ""),
          });
        }}
      >
        <label>
          Search
          <input name="q" defaultValue={filters.q} placeholder="Event or team" />
        </label>
        <label>
          Team
          <input name="team" defaultValue={filters.team} placeholder="e.g. Arsenal" />
        </label>
        <label>
          Sport
          <select name="sport" defaultValue={filters.sport}>
            <option value="">All</option>
            {(catalog?.sports ?? []).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          Competition
          <select name="competition" defaultValue={filters.competition}>
            <option value="">All</option>
            {(catalog?.competitions ?? []).map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select name="status" defaultValue={filters.status}>
            {STATUSES.map((s) => (
              <option key={s || "all"} value={s}>
                {s || "All"}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="accent-btn">
          Apply
        </button>
      </form>

      {ambiguous ? (
        <StateBlock
          tone="warn"
          title="Ambiguous team match"
          message="Multiple strong matches were returned. Choose an event explicitly — nothing was auto-selected."
        />
      ) : null}

      {loading ? <SkeletonGrid count={6} /> : null}
      {error ? <StateBlock tone="error" title="Could not load events" message={error} /> : null}
      {!loading && !error && events.length === 0 ? (
        <StateBlock title="No events" message="Try clearing filters or searching another team." />
      ) : null}
      {!loading && leagues.length > 0
        ? leagues.map((league) => (
            <section key={league.key} className="content-section league-section">
              <div className="section-head">
                <h2>
                  {league.name}
                  <span className="league-sport">{league.sport}</span>
                </h2>
                <span className="muted">{league.events.length} matches</span>
              </div>
              <div className="card-grid">
                {league.events.map((e) => (
                  <EventCard key={e.id} event={e} hideCompetition />
                ))}
              </div>
            </section>
          ))
        : null}
    </SiteShell>
  );
}
