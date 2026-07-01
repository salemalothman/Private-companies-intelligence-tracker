"use client";

import type { LucideIcon } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

/**
 * A self-contained collapsible dashboard panel: a `label-eyebrow` header (icon +
 * title + optional count) that toggles its content, with a chevron that rotates
 * on open. Shared by the dashboard lists so the accordion boilerplate lives in
 * one place. Pass `className` to override the wrapper (e.g. `rounded-xl` for a
 * top-level card vs. the default `rounded-lg` for a nested one).
 */
export function CollapsibleSection({
  title,
  icon: Icon,
  count,
  defaultOpen = false,
  className,
  children,
}: {
  title: string;
  /** Consumers passing an icon must be client components (a lucide `forwardRef`
   * can't cross the server→client boundary). */
  icon?: LucideIcon;
  count?: number;
  defaultOpen?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const value = "section";
  return (
    <Accordion type="single" collapsible defaultValue={defaultOpen ? value : undefined}>
      <AccordionItem
        value={value}
        className={cn("overflow-hidden rounded-lg border border-border", className)}
      >
        <AccordionTrigger className="label-eyebrow px-5 py-2.5 hover:bg-muted/40 data-[state=open]:border-b data-[state=open]:border-border">
          <span className="flex items-center gap-2">
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {title}
            {count != null && <span className="text-muted-foreground">({count})</span>}
          </span>
        </AccordionTrigger>
        <AccordionContent>{children}</AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

/** Muted empty-state row used inside dashboard section panels. */
export function SectionEmpty({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-4 text-sm text-muted-foreground">{children}</p>;
}
