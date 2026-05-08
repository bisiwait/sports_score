import { Suspense } from "react";
import { MatchClient } from "./MatchClient";

function MatchFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center text-sm text-foreground/50">
      読み込み中…
    </div>
  );
}

export default function MatchPage() {
  return (
    <Suspense fallback={<MatchFallback />}>
      <MatchClient />
    </Suspense>
  );
}
