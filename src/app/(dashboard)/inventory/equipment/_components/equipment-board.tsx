"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, ShoppingCart, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";

import { type SpendProps, useSpending } from "../../../expenses/_components/expenses-board";
import { Field } from "@/components/auth";
import { ConfirmDialog, EmptyState, Fab, Panel, StatCard } from "@/components/kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { Sheet } from "@/components/ui/sheet";
import {
  ASSET_KIND_LABELS,
  ASSET_KINDS,
  ASSET_STATUS_LABELS,
  type AssetInput,
  type AssetKind,
  DEFAULT_LIFE,
  depreciationFor,
  validateAsset,
} from "@/lib/assets/rules";
import type { AssetView } from "@/lib/assets/service";
import { type AuthError, apiRequest } from "@/lib/auth/client";
import { formatRange } from "@/lib/dates";
import { formatNaira } from "@/lib/money";

const day = (d: string) => formatRange({ from: d, to: d });
export const lifeLabel = (months: number) =>
  months % 12 === 0 ? `${months / 12} year${months === 12 ? "" : "s"}` : `${months} months`;

/** The farm's equipment: what it cost, what it's worth now, and what it costs each month. */
export function EquipmentBoard({
  assets,
  today,
  canWrite,
  spending,
}: {
  assets: AssetView[];
  today: string;
  canWrite: boolean;
  spending: SpendProps;
}) {
  const router = useRouter();
  const buying = useSpending(spending);
  const buy = () => buying.spend({ kind: "other", category: "equipment" });
  const [editing, setEditing] = React.useState<AssetView | "new" | null>(null);
  const inUse = assets.filter((a) => a.status === "in-use");
  const saved = (message: string) => {
    setEditing(null);
    toast.success(message);
    router.refresh();
  };

  return (
    <div className="space-y-4 pt-4">
      {assets.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="Worth now"
            value={formatNaira(inUse.reduce((n, a) => n + a.bookValueKobo, 0))}
            hint={`${inUse.length} in use`}
          />
          <StatCard
            label="Costs this month"
            value={formatNaira(assets.reduce((n, a) => n + depreciationFor(a, today.slice(0, 7)), 0))}
            hint="Depreciation"
          />
        </div>
      )}
      {canWrite && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={buy}>
            <ShoppingCart /> Buy equipment
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setEditing("new")}>
            <Plus /> Add what you already have
          </Button>
        </div>
      )}
      {assets.length ? (
        <Panel flush>
          <ul className="divide-y divide-line">
            {assets.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  disabled={!canWrite}
                  onClick={() => setEditing(a)}
                  className="focus-ring flex w-full items-center gap-3 px-5 py-3.5 text-left enabled:hover:bg-surface-subtle"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-fg">{a.name}</span>
                      {a.status !== "in-use" && <Badge>{ASSET_STATUS_LABELS[a.status]}</Badge>}
                    </span>
                    <span className="block text-xs text-fg-muted">
                      {ASSET_KIND_LABELS[a.kind]} · {formatNaira(a.costKobo)} on {day(a.purchasedOn)} · over{" "}
                      {lifeLabel(a.usefulLifeMonths)}
                    </span>
                  </span>
                  <span className="num flex shrink-0 flex-col items-end gap-1.5 text-right">
                    <span className="block font-semibold text-fg">{formatNaira(a.bookValueKobo)}</span>
                    <span className="block text-xs text-fg-subtle">{formatNaira(a.monthlyKobo)} a month</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      ) : (
        <Panel>
          <EmptyState
            icon={<Wrench />}
            title="No equipment yet"
            description="Generators, drinkers, feeders, brooders: their cost is spread over the years they last. Buy them through Spend money, or add what you already have."
            action={
              canWrite ? (
                <div className="flex flex-wrap justify-center gap-2">
                  <Button size="sm" onClick={buy}>
                    <ShoppingCart /> Buy equipment
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setEditing("new")}>
                    <Plus /> Add what you already have
                  </Button>
                </div>
              ) : undefined
            }
          />
        </Panel>
      )}
      {canWrite && <Fab label="Buy equipment" icon={<ShoppingCart />} onClick={buy} />}
      {canWrite && buying.sheets}
      {editing && (
        <AssetSheet
          key={editing === "new" ? "new" : editing.id}
          asset={editing === "new" ? null : editing}
          today={today}
          onClose={() => setEditing(null)}
          onSaved={saved}
        />
      )}
    </div>
  );
}

function AssetSheet({
  asset,
  today,
  onClose,
  onSaved,
}: {
  asset: AssetView | null;
  today: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [v, setV] = React.useState<AssetInput>(
    asset ?? {
      name: "",
      kind: "generator",
      costKobo: Number.NaN,
      salvageKobo: 0,
      purchasedOn: today,
      usefulLifeMonths: 24,
      notes: "",
    },
  );
  const [submitted, setSubmitted] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<AuthError | null>(null);
  const [disposing, setDisposing] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const errors = validateAsset(v, { today });
  const show = (f: keyof AssetInput) => (failure?.field === f ? failure.message : submitted ? errors[f] : undefined);
  const set = <K extends keyof AssetInput>(k: K, value: AssetInput[K]) => setV((d) => ({ ...d, [k]: value }));
  const locked = !!asset?.expenseId;
  const monthly =
    Number.isFinite(v.costKobo) && v.usefulLifeMonths > 0
      ? Math.floor(Math.max(0, v.costKobo - v.salvageKobo) / v.usefulLifeMonths)
      : null;

  const save = async () => {
    setSubmitted(true);
    setFailure(null);
    if (Object.keys(errors).length) return;
    setBusy(true);
    try {
      if (asset) await apiRequest(`/api/assets/${asset.id}`, "PATCH", { ...v, version: asset.version });
      else await apiRequest("/api/assets", "POST", v);
      onSaved(asset ? `${v.name} saved.` : `${v.name} added.`);
    } catch (e) {
      setFailure(e as AuthError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Sheet
        open
        onClose={() => !busy && onClose()}
        title={asset ? asset.name : "Add equipment"}
        subtitle={asset ? ASSET_KIND_LABELS[asset.kind] : "Something that lasts years"}
        footer={
          <div className="space-y-2">
            <ActionFeedback action={{ failure }} />
            <Button size="lg" fullWidth loading={busy} onClick={() => void save()}>
              {asset ? "Save changes" : "Add equipment"}
            </Button>
            {asset && asset.status === "in-use" && (
              <div className="grid grid-cols-2 gap-2">
                <Button variant="ghost" onClick={() => setDisposing(true)}>
                  Sold or scrapped
                </Button>
                {!locked && (
                  <Button variant="ghost" className="text-danger-fg" onClick={() => setDeleting(true)}>
                    <Trash2 /> Delete
                  </Button>
                )}
              </div>
            )}
          </div>
        }
      >
        <div className="space-y-5">
          <Field id="name" label="Name" error={show("name")}>
            {(a11y) => (
              <Input
                {...a11y}
                value={v.name}
                maxLength={80}
                placeholder="Perkins 20 kVA generator"
                onChange={(e) => set("name", e.target.value)}
              />
            )}
          </Field>
          <Field id="kind" label="What it is" error={show("kind")}>
            {(a11y) => (
              <Select
                {...a11y}
                value={v.kind}
                onChange={(e) => {
                  const kind = e.target.value as AssetKind;
                  // A new asset starts from the usual life for its kind.
                  setV((d) => ({ ...d, kind, usefulLifeMonths: asset ? d.usefulLifeMonths : DEFAULT_LIFE[kind] }));
                }}
              >
                {ASSET_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {ASSET_KIND_LABELS[k]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="costKobo" label="Cost" error={show("costKobo")} hint={locked ? "From its expense" : undefined}>
              {(a11y) => (
                <MoneyInput
                  {...a11y}
                  disabled={locked}
                  value={Number.isFinite(v.costKobo) ? v.costKobo : null}
                  onChange={(k) => set("costKobo", k ?? Number.NaN)}
                  placeholder="600,000.00"
                />
              )}
            </Field>
            <Field id="purchasedOn" label="Bought on" error={show("purchasedOn")}>
              {(a11y) => (
                <Input
                  {...a11y}
                  type="date"
                  disabled={locked}
                  value={v.purchasedOn}
                  max={today}
                  onChange={(e) => set("purchasedOn", e.target.value)}
                />
              )}
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field
              id="usefulLifeMonths"
              label="Lasts (months)"
              error={show("usefulLifeMonths")}
              hint={lifeLabel(v.usefulLifeMonths || 0)}
            >
              {(a11y) => (
                <Input
                  {...a11y}
                  inputMode="numeric"
                  className="num"
                  value={Number.isFinite(v.usefulLifeMonths) ? String(v.usefulLifeMonths) : ""}
                  onChange={(e) =>
                    set(
                      "usefulLifeMonths",
                      e.target.value === "" ? Number.NaN : Number(e.target.value.replace(/\D/g, "")),
                    )
                  }
                />
              )}
            </Field>
            <Field
              id="salvageKobo"
              label="Worth at the end"
              error={show("salvageKobo")}
              hint="Scrap or resale; often 0"
            >
              {(a11y) => (
                <MoneyInput
                  {...a11y}
                  value={v.salvageKobo}
                  onChange={(k) => set("salvageKobo", k ?? 0)}
                  placeholder="0.00"
                />
              )}
            </Field>
          </div>
          {monthly !== null && (
            <p className="text-sm text-fg-muted" aria-live="polite">
              Costs the farm <strong className="num text-fg">{formatNaira(monthly)}</strong> a month for{" "}
              {lifeLabel(v.usefulLifeMonths)}.
            </p>
          )}
          <Field id="notes" label="Notes" error={show("notes")} hint="Optional: serial number, where it is">
            {(a11y) => (
              <Textarea
                {...a11y}
                rows={2}
                maxLength={500}
                value={v.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            )}
          </Field>
        </div>
      </Sheet>
      {asset && disposing && (
        <DisposeSheet asset={asset} today={today} onClose={() => setDisposing(false)} onSaved={onSaved} />
      )}
      {asset && (
        <ConfirmDialog
          open={deleting}
          onOpenChange={setDeleting}
          title={`Delete ${asset.name}?`}
          description="It leaves your equipment and stops costing the farm. It stays in the audit log."
          confirmLabel="Delete equipment"
          onConfirm={async () => {
            await apiRequest(`/api/assets/${asset.id}`, "DELETE");
            onSaved(`${asset.name} deleted.`);
          }}
        />
      )}
    </>
  );
}

function DisposeSheet({
  asset,
  today,
  onClose,
  onSaved,
}: {
  asset: AssetView;
  today: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [status, setStatus] = React.useState<"sold" | "scrapped">("sold");
  const [on, setOn] = React.useState(today);
  const [proceeds, setProceeds] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<AuthError | null>(null);
  return (
    <Sheet
      open
      onClose={() => !busy && onClose()}
      title={`${asset.name}: sold or scrapped`}
      subtitle={`Worth ${formatNaira(asset.bookValueKobo)} now`}
      footer={
        <div className="space-y-2">
          <ActionFeedback action={{ failure }} />
          <Button
            size="lg"
            fullWidth
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setFailure(null);
              try {
                await apiRequest(`/api/assets/${asset.id}/dispose`, "POST", {
                  status,
                  disposedOn: on,
                  proceedsKobo: proceeds ?? 0,
                });
                onSaved(`${asset.name} marked ${status}.`);
              } catch (e) {
                setFailure(e as AuthError);
              } finally {
                setBusy(false);
              }
            }}
          >
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <Segmented
          label="What happened"
          className="w-full"
          value={status}
          onChange={setStatus}
          options={[
            { value: "sold", label: "Sold" },
            { value: "scrapped", label: "Scrapped" },
          ]}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field id="disposedOn" label="On">
            {(a11y) => (
              <Input
                {...a11y}
                type="date"
                value={on}
                min={asset.purchasedOn}
                max={today}
                onChange={(e) => setOn(e.target.value)}
              />
            )}
          </Field>
          {status === "sold" && (
            <Field id="proceedsKobo" label="Sold for">
              {(a11y) => <MoneyInput {...a11y} value={proceeds} onChange={setProceeds} placeholder="0.00" />}
            </Field>
          )}
        </div>
        <p className="text-sm text-fg-muted">It stops costing the farm after that month.</p>
      </div>
    </Sheet>
  );
}
