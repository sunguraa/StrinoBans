import { Suspense } from "react";
import { VetoRoom } from "@/components/veto/veto-room";

function VetoFallback() {
  return (
    <div className="flex h-full items-center justify-center" role="status" aria-live="polite">
      <span>Loading veto room...</span>
    </div>
  );
}

export default function VetoPage() {
  return (
    <div className="h-screen">
      <Suspense fallback={<VetoFallback />}>
        <VetoRoom />
      </Suspense>
    </div>
  );
}
