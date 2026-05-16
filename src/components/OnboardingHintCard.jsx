import { Info } from "lucide-react";
import { TenaqoCard } from "./ui/TenaqoPrimitives";

export default function OnboardingHintCard({ title, body }) {
  return (
    <TenaqoCard variant="subtle">
      <div className="flex items-start gap-3">
        <div className="tenaqo-icon-tile mt-0.5">
          <Info size={16} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{body}</p>
        </div>
      </div>
    </TenaqoCard>
  );
}
