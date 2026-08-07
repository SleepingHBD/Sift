import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/primitives";

export function EmptyState({ icon: Icon, eyebrow, title, description, actions, compact = false }: { icon: LucideIcon; eyebrow?: string; title: string; description: string; actions?: React.ReactNode; compact?: boolean }) {
  return (
    <Card className={`workspace-empty-state ${compact ? "workspace-empty-state--compact" : ""}`}>
      <span className="workspace-empty-state__icon"><Icon size={compact ? 18 : 23} /></span>
      <div>{eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}<h2>{title}</h2><p>{description}</p></div>
      {actions ? <div className="workspace-empty-state__actions">{actions}</div> : null}
    </Card>
  );
}
