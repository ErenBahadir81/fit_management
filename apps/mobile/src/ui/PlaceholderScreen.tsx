import React from "react";
import { Floo } from "../mascot/Floo";
import { EmptyState } from "./EmptyState";
import { Header } from "./Header";
import { Screen } from "./Screen";

/** Temporary tab content until the owning feature agent lands the real screen. */
export function PlaceholderScreen({ title, subtitle, body }: { title: string; subtitle?: string; body: string }) {
  return (
    <Screen>
      <Header title={title} subtitle={subtitle} />
      <EmptyState illustration={<Floo mood="sleepy" size="m" />} title="Yakında" body={body} />
    </Screen>
  );
}
