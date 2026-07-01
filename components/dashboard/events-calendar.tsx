"use client";

import {
  CalendarClock,
  DollarSign,
  History,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CollapsibleSection,
  SectionEmpty,
} from "@/components/dashboard/collapsible-section";
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import type { CalendarEvent } from "@/lib/queries";

const ICON: Record<string, LucideIcon> = {
  corporate: CalendarClock,
  valuation: TrendingUp,
  secondary: DollarSign,
};

const TYPE_LABEL: Record<string, string> = {
  corporate: "Event",
  valuation: "Valuation",
  secondary: "Secondary",
};

function valueLabel(e: CalendarEvent): string | null {
  if (e.value == null) return null;
  return e.type === "secondary" ? `${formatCurrency(e.value)}/share` : formatCurrency(e.value);
}

function Row({ e, muted }: { e: CalendarEvent; muted?: boolean }) {
  const Icon = ICON[e.type] ?? CalendarClock;
  const v = valueLabel(e);
  const body = (
    <span className="flex items-start gap-3 px-5 py-3">
      <span
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          muted ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 text-sm">
          {e.company && <span className="font-medium">{e.company}</span>}
          <Badge variant="secondary">{TYPE_LABEL[e.type] ?? e.type}</Badge>
          {v && <span className="tabular-nums text-muted-foreground">{v}</span>}
        </span>
        <span className="mt-0.5 block truncate text-sm text-muted-foreground">
          {e.title}
        </span>
      </span>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
        {e.event_date ? formatDate(e.event_date) : "—"}
      </span>
    </span>
  );
  return e.url ? (
    <a href={e.url} target="_blank" rel="noopener noreferrer" className="block hover:bg-muted/40">
      {body}
    </a>
  ) : (
    <div>{body}</div>
  );
}

export function EventsCalendar({
  upcoming,
  past,
}: {
  upcoming: CalendarEvent[];
  past: CalendarEvent[];
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Events &amp; market signals</CardTitle>
      </CardHeader>
      {/* Upcoming defaults open; the longer historical timeline starts collapsed. */}
      <CardContent className="space-y-3">
        <CollapsibleSection
          title="Upcoming"
          icon={CalendarClock}
          count={upcoming.length}
          defaultOpen
        >
          {upcoming.length === 0 ? (
            <SectionEmpty>
              No upcoming events yet — press Sync to refresh scheduled events,
              fresh valuations, and secondary prices from the web.
            </SectionEmpty>
          ) : (
            <div className="divide-y divide-border/70">
              {upcoming.map((e) => (
                <Row key={e.id} e={e} />
              ))}
            </div>
          )}
        </CollapsibleSection>

        {past.length > 0 && (
          <CollapsibleSection title="Historical timeline" icon={History} count={past.length}>
            <div className="divide-y divide-border/70">
              {past.slice(0, 12).map((e) => (
                <Row key={e.id} e={e} muted />
              ))}
            </div>
          </CollapsibleSection>
        )}
      </CardContent>
    </Card>
  );
}
