"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { Panel } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/auth/client";
import { DELIVERY_LABELS, PER_UNIT } from "@/lib/contracts/rules";
import type { TemplateView } from "@/lib/contracts/service";
import { formatNaira } from "@/lib/money";
import { useAction } from "@/lib/use-action";

/** The templates a new contract can start from; kept from a contract, removed here. */
export function TemplatesPanel({ templates, canWrite }: { templates: TemplateView[]; canWrite: boolean }) {
  const router = useRouter();
  const action = useAction();
  if (!templates.length) return null;
  return (
    <Panel
      title="Templates"
      description="A new contract can start from one of these: keep one by ticking it when you write a contract."
      flush
    >
      <ul className="divide-y divide-line">
        {templates.map((t) => (
          <li key={t.id} className="flex items-center gap-3 px-5 py-3">
            <span className="min-w-0 flex-1 space-y-1">
              <span className="block truncate font-semibold text-fg">{t.name}</span>
              <span className="num block text-xs text-fg-muted">
                {formatNaira(t.priceKobo)} {PER_UNIT[t.pricing]} · {DELIVERY_LABELS[t.deliveryEvery]} · {t.months}{" "}
                months
              </span>
            </span>
            {canWrite && (
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Remove the ${t.name} template`}
                loading={action.isPending(t.id)}
                disabled={action.busy}
                onClick={() =>
                  void action.run(() => apiRequest(`/api/contract-templates/${t.id}`, "DELETE"), {
                    key: t.id,
                    toastError: true,
                    success: `The ${t.name} template is removed.`,
                    onSuccess: () => router.refresh(),
                  })
                }
              >
                <Trash2 />
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
