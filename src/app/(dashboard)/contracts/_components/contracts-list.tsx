"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileSignature, Plus } from "lucide-react";
import { toast } from "sonner";

import { ContractSheet, STATUS_TONE } from "./contract-sheet";
import { EmptyState, Panel } from "@/components/kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PER_UNIT, STATUS_LABELS } from "@/lib/contracts/rules";
import type { ContractView, TemplateView } from "@/lib/contracts/service";
import { formatRange } from "@/lib/dates";
import { formatNaira } from "@/lib/money";

/**
 * A list of contracts that opens each in its sheet, with "Write a contract". Used on the
 * Contracts page (every customer) and on a customer's page (theirs, the customer already set).
 */
export function ContractsList({
  contracts,
  customers,
  customerId,
  templates,
  today,
  canWrite,
  openId,
  title = "Contracts",
  description,
  showCustomer = true,
}: {
  contracts: ContractView[];
  customers: { id: string; name: string; termsDays: number }[];
  customerId?: string;
  templates: TemplateView[];
  today: string;
  canWrite: boolean;
  openId?: string;
  title?: string;
  description?: string;
  showCustomer?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState<ContractView | "new" | null>(
    () => contracts.find((c) => c.id === openId) ?? null,
  );
  const write = canWrite ? (
    <Button size="sm" onClick={() => setOpen("new")} disabled={!customers.length} reason="Add a customer first.">
      <Plus /> Write a contract
    </Button>
  ) : undefined;

  return (
    <Panel title={title} description={description} actions={contracts.length ? write : undefined} flush>
      {contracts.length === 0 ? (
        <EmptyState
          icon={<FileSignature />}
          title="No contracts yet"
          description="Write down what you agreed: the price per kg or per bird, how many birds and how often. While it runs, the customer's orders use its price."
          action={write}
        />
      ) : (
        <ul className="divide-y divide-line">
          {contracts.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setOpen(c)}
                className="focus-ring flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-surface-subtle"
              >
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="block truncate font-semibold text-fg">
                    {showCustomer ? c.customerName : c.number}
                  </span>
                  <span className="block text-xs text-fg-muted">
                    {showCustomer && `${c.number} · `}
                    {formatRange({ from: c.startDate, to: c.terminatedOn ?? c.endDate })}
                  </span>
                </span>
                <span className="num flex shrink-0 flex-col items-end gap-1.5 text-right">
                  <span className="block font-semibold text-fg">
                    {formatNaira(c.priceKobo)} <span className="font-normal text-fg-muted">{PER_UNIT[c.pricing]}</span>
                  </span>
                  <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABELS[c.status]}</Badge>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <ContractSheet
          contract={open === "new" ? null : open}
          customers={customers}
          customerId={customerId}
          templates={templates}
          today={today}
          canWrite={canWrite}
          onClose={() => setOpen(null)}
          onSaved={(message) => {
            setOpen(null);
            toast.success(message);
            router.refresh();
          }}
        />
      )}
    </Panel>
  );
}
