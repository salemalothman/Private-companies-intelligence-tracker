"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  DollarSign,
  History,
  RefreshCw,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { scanCompanyEvents } from "@/app/(app)/dashboard/actions";
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
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function scan() {
    setMsg(null);
    start(async () => {
      const r = await scanCompanyEvents();
      if ("error" in r) setMsg(r.error);
      else
        setMsg(
          `Scanned ${r.companies} ${r.companies === 1 ? "company" : "companies"} — ${r.inserted} new event${r.inserted === 1 ? "" : "s"} added.`,
        );
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-sm font-medium">Events &amp; market signals</CardTitle>
          {msg && <p className="mt-0.5 text-xs text-muted-foreground">{msg}</p>}
        </div>
        <Button size="sm" onClick={scan} disabled={pending}>
          <RefreshCw className={cn("h-3.5 w-3.5", pending && "animate-spin")} />
          {pending ? "Scanning…" : "Scan for events"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        <Section title="Upcoming" icon={CalendarClock} count={upcoming.length}>
          {upcoming.length === 0 ? (
            <Empty>
              No upcoming events. Run a scan to fetch scheduled events, fresh
              valuations, and secondary prices from the web.
            </Empty>
          ) : (
            <div className="divide-y divide-border/70">
              {upcoming.map((e) => (
                <Row key={e.id} e={e} />
              ))}
            </div>
          )}
        </Section>

        {past.length > 0 && (
          <Section title="Historical timeline" icon={History} count={past.length}>
            <div className="divide-y divide-border/70">
              {past.slice(0, 12).map((e) => (
                <Row key={e.id} e={e} muted />
              ))}
            </div>
          </Section>
        )}
      </CardContent>
    </Card>
  );
}

function Section({
  title,
  icon: Icon,
  count,
  children,
}: {
  title: string;
  icon: LucideIcon;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="label-eyebrow flex items-center gap-2 border-b border-border px-5 py-2.5">
        <Icon className="h-3.5 w-3.5" />
        {title}
        <span className="text-muted-foreground">({count})</span>
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-4 text-sm text-muted-foreground">{children}</p>;
}
