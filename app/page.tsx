import Link from "next/link";
import { ArrowRight, LineChart, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 font-semibold">
            <LineChart className="h-5 w-5 text-primary" />
            <span>Private Portfolio Intelligence</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">
                Sign in
              </Button>
            </Link>
            <Link href="/signup">
              <Button size="sm">Get started</Button>
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-24">
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          A private-market terminal for investors
        </p>
        <h1 className="max-w-3xl text-balance text-5xl font-bold tracking-tight">
          Know what your private portfolio is worth today — and why it changed.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
          Track private companies you own or follow. Record investments, monitor
          valuation changes and funding rounds, and estimate portfolio
          performance for companies with no public market data.
        </p>
        <div className="mt-8 flex items-center gap-4">
          <Link href="/signup">
            <Button size="lg" className="gap-2">
              Start tracking <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/login">
            <Button size="lg" variant="outline">
              Sign in
            </Button>
          </Link>
        </div>

        <div className="mt-20 grid gap-6 sm:grid-cols-3">
          {[
            {
              icon: LineChart,
              title: "Valuation tracking",
              body: "Timeline of every round with pre/post-money, share price, and confidence.",
            },
            {
              icon: Sparkles,
              title: "AI insights",
              body: "Valuation, news sentiment, and risk agents to interpret what changed.",
            },
            {
              icon: ShieldCheck,
              title: "Your data, isolated",
              body: "Row-level security keeps every investor's portfolio private.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-lg border border-border bg-card p-6"
            >
              <Icon className="h-6 w-6 text-primary" />
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
