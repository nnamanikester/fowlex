import type { Metadata } from "next";

import { Planned } from "../_components/planned";

export const metadata: Metadata = { title: "People" };

export default function PeoplePage() {
  return <Planned title="People" description="Staff records, attendance and salary advances." step="5.1" />;
}
