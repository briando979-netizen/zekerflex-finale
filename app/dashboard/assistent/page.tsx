import { BrainChat } from "@/components/brain/BrainChat";

export const dynamic = "force-dynamic";

export default function AssistentPage() {
  return (
    <div className="mx-auto h-[calc(100dvh-9rem)] max-w-2xl overflow-hidden rounded-2xl border border-hair">
      <BrainChat />
    </div>
  );
}
