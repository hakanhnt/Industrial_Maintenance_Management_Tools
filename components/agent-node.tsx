import type { AgentCode } from "@/lib/models/maintenance";
import { cn } from "@/lib/utils/cn";

const accentByAgent: Record<AgentCode, string> = {
  CORE: "border-signal/50 text-signal",
  FIELD: "border-cyanline/50 text-cyanline",
  FLOW: "border-copper/60 text-[#ffc28d]",
  BASE: "border-platinum/30 text-platinum",
  KPI: "border-[#b9a8ff]/60 text-[#d5ccff]",
  LEAD: "border-signal/70 text-signal"
};

interface AgentNodeProps {
  code: AgentCode;
  label: string;
  active?: boolean;
  working?: boolean;
  skipped?: boolean;
}

export function AgentNode({ code, label, active, working, skipped }: AgentNodeProps) {
  return (
    <div
      className={cn(
        "relative flex min-h-20 overflow-hidden rounded-lg border bg-white/[0.035] p-3 transition",
        accentByAgent[code],
        active && "bg-white/[0.07] shadow-glow",
        working && "agent-working bg-white/[0.08] shadow-glow",
        skipped && "border-white/10 text-muted opacity-55"
      )}
    >
      <div className="relative z-10 flex items-center gap-3">
        <div
          className={cn(
            "agent-orbit grid size-11 shrink-0 place-items-center rounded-full border border-current/40 font-mono text-xs font-semibold",
            working && "animate-pulse"
          )}
        >
          {code}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-platinum">{label}</div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
            {working ? "çalışıyor" : skipped ? "atlanmış" : "sequential agent"}
          </div>
        </div>
      </div>
    </div>
  );
}
