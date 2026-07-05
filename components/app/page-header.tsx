import { TextEffect } from "@/components/motion-primitives/text-effect";

export function PageHeader({
  title,
  subtitle,
  actions,
  titleEffect = false,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  /** Per-word blur-fade entrance on the title (motion-primitives TextEffect).
   * Opt-in per surface — the dashboard hero uses it; utility pages stay static. */
  titleEffect?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {titleEffect ? (
          <TextEffect
            as="h1"
            per="word"
            preset="fade-in-blur"
            speedReveal={1.6}
            className="text-[1.65rem] font-semibold tracking-tight"
          >
            {title}
          </TextEffect>
        ) : (
          <h1 className="text-[1.65rem] font-semibold tracking-tight">{title}</h1>
        )}
        {subtitle && (
          <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
