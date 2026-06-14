import { cn } from "@/lib/utils/cn";

interface StatusPillProps {
  tone: "ready" | "warning" | "muted";
  children: React.ReactNode;
}

export function StatusPill({ tone, children }: StatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center rounded-full border px-3 text-xs font-medium",
        tone === "ready" &&
          "border-signal/40 bg-signal/10 text-signal shadow-[0_0_20px_rgba(201,242,77,0.12)]",
        tone === "warning" && "border-copper/50 bg-copper/10 text-[#ffd3a6]",
        tone === "muted" && "border-white/10 bg-white/[0.04] text-muted"
      )}
    >
      {children}
    </span>
  );
}
