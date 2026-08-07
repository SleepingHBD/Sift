import Link from "next/link";
import { Plus, Radio } from "lucide-react";
import { PageIntro } from "@/components/ui/primitives";
import { EmptyState } from "@/components/workspace/empty-state";

export function TrendsPage() {
  return <div className="page"><PageIntro eyebrow="Trend intelligence" title="Keywords are clues. Context is the work." description="Trends will appear after Radar has enough genuine conversation history to compare against a baseline." /><EmptyState icon={Radio} title="No trends detected yet." description="Connect a Radar source and collect enough conversation history to begin measuring unusual growth." actions={<Link className="ui-button ui-button--dark ui-button--md" href="/radar"><Plus size={15} />Create Radar monitor</Link>} /></div>;
}
