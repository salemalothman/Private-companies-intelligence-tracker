"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { m } from "motion/react";
import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

/**
 * Opt-in context for the springing active-tab pill. A controlled tabs wrapper
 * (UrlTabs) that knows the active value provides `{ value, id }` here; plain
 * Radix `Tabs` consumers get `null` and keep the original CSS pill — zero
 * regression outside the opted-in surfaces. `id` scopes the motion `layoutId`
 * so two pill-enabled tab strips on one page can never trade pills.
 */
const TabsActiveValueContext = React.createContext<{
  value: string;
  id: string;
} | null>(null);

function TabsActiveValueProvider({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}) {
  const id = React.useId();
  const ctx = React.useMemo(() => ({ value, id }), [value, id]);
  return (
    <TabsActiveValueContext.Provider value={ctx}>
      {children}
    </TabsActiveValueContext.Provider>
  );
}

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      // rounded-[10px]: concentric with the triggers — inner rounded-md (6px)
      // + p-1 (4px) padding = 10px outer, so the nested corners share a center.
      "inline-flex h-9 items-center justify-center rounded-[10px] bg-muted p-1 text-muted-foreground",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, children, value, ...props }, ref) => {
  const active = React.useContext(TabsActiveValueContext);
  const motionPill = active !== null;
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      value={value}
      className={cn(
        "relative inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-[color,background-color,box-shadow] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
        motionPill
          ? // The pill itself is the m.span below; the active label goes brand.
            "data-[state=active]:text-brand"
          : "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow",
        className,
      )}
      {...props}
    >
      {motionPill && active.value === value && (
        // Springs between triggers via shared layoutId. Lives INSIDE the
        // trigger (absolute) — never reparent Radix triggers. Keyboard
        // activation changes value in the same commit, so arrows move it too.
        <m.span
          layoutId={`tab-pill-${active.id}`}
          className="absolute inset-0 rounded-md bg-background shadow"
          transition={{ type: "spring", stiffness: 500, damping: 40 }}
          aria-hidden="true"
        />
      )}
      <span className="relative z-10">{children}</span>
    </TabsPrimitive.Trigger>
  );
});
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn("mt-4 focus-visible:outline-none", className)}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent, TabsActiveValueProvider };
