"use client";

import * as React from "react";
import { Bird, Egg, PackageOpen, Plus, ReceiptText, Skull, Trash2, Truck, Wheat } from "lucide-react";
import { toast } from "sonner";

import {
  ConfirmDialog,
  EmptyState,
  FilterMenu,
  IdText,
  Kbd,
  MetricCard,
  Panel,
  ProgressRing,
  StatCard,
  TestModeBanner,
} from "@/components/kit";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import { Modal } from "@/components/ui/modal";
import { Popover } from "@/components/ui/popover";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleSwitch } from "@/components/ui/toggle-switch";

export function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 space-y-4 border-t border-line pt-10 first:border-0 first:pt-0">
      <h2 className="font-display text-xl font-bold tracking-tight text-fg-heading">{title}</h2>
      {children}
    </section>
  );
}

/** Every component, with farm examples. Interactive, so it is a client component. */
export function Showcase() {
  return (
    <div className="space-y-12">
      <Section id="buttons" title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>
            <Plus /> New batch
          </Button>
          <Button variant="secondary">
            <ReceiptText /> Record expense
          </Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="danger">
            <Trash2 /> Delete batch
          </Button>
          <Button variant="link">View invoice</Button>
          <Button loading>Saving</Button>
          <Button disabled>Disabled</Button>
          <Button size="sm" variant="secondary">
            Small
          </Button>
          <LinkButton href="#buttons" variant="secondary" size="sm">
            A link that looks like a button
          </LinkButton>
        </div>
      </Section>

      <Section id="status" title="Status">
        <div className="flex flex-wrap gap-2">
          <Badge tone="success" dot>
            Paid
          </Badge>
          <Badge tone="success">Profit</Badge>
          <Badge tone="warning" dot>
            Due in 3 days
          </Badge>
          <Badge tone="warning">Low stock</Badge>
          <Badge tone="danger" dot>
            Overdue
          </Badge>
          <Badge tone="danger">Loss</Badge>
          <Badge tone="info" dot>
            Vaccination due
          </Badge>
          <Badge tone="brand">Active</Badge>
          <Badge>Draft</Badge>
        </div>
        <TestModeBanner className="rounded-xl border" />
      </Section>

      <Section id="forms" title="Forms">
        <FormsDemo />
      </Section>

      <Section id="data" title="Data">
        <DataDemo />
      </Section>

      <Section id="overlays" title="Overlays and feedback">
        <OverlaysDemo />
      </Section>
    </div>
  );
}

function FormsDemo() {
  const [period, setPeriod] = React.useState<"month" | "quarter" | "year">("month");
  const [status, setStatus] = React.useState<"" | "paid" | "overdue" | "draft">("overdue");
  const [notify, setNotify] = React.useState(true);
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          label="Report period"
          value={period}
          onChange={setPeriod}
          options={[
            { value: "month", label: "Month" },
            { value: "quarter", label: "Quarter" },
            { value: "year", label: "Year" },
          ]}
        />
        <FilterMenu
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: "paid", label: "Paid" },
            { value: "overdue", label: "Overdue" },
            { value: "draft", label: "Draft" },
          ]}
        />
      </div>
      <div className="grid max-w-2xl gap-5 sm:grid-cols-2">
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold text-fg">Deaths today</span>
          <Input type="number" inputMode="numeric" placeholder="0" />
        </label>
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold text-fg">Feed used (kg)</span>
          <Input type="number" inputMode="decimal" aria-invalid="true" defaultValue="-5" />
          <span className="text-xs font-medium text-danger-fg">Feed used can&apos;t be negative.</span>
        </label>
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold text-fg">Batch</span>
          <Input readOnly value="B-2026-07" className="font-mono" />
        </label>
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold text-fg">Supplier</span>
          <Input disabled value="Amo Byng Nigeria Ltd" />
        </label>
        <label className="grid gap-1.5 sm:col-span-2">
          <span className="text-sm font-semibold text-fg">Notes</span>
          <Textarea placeholder="Anything unusual today? Birds panting, drinkers leaking…" />
        </label>
        <label className="flex items-center gap-3 text-sm font-semibold text-fg">
          <ToggleSwitch checked={notify} onChange={setNotify} ariaLabel="Email me when stock runs low" />
          Email me when stock runs low
        </label>
      </div>
      <p className="text-xs text-fg-subtle">
        Labelled fields with error wiring (Field) arrive with sign-in in step 1.7.
      </p>
    </>
  );
}

function DataDemo() {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Live birds" value="2,785" hint="across 3 batches" />
        <StatCard
          label="Net profit this month"
          value="₦1,240,500"
          trend={{ value: "+18%", direction: "up" }}
          hint="vs October"
        />
        <StatCard
          label="Mortality"
          value="1.6%"
          trend={{ value: "+0.4 pts", direction: "up", invert: true }}
          hint="this batch"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <MetricCard
          label="Revenue"
          icon={<Bird />}
          value="₦4,850,000"
          delta={{ value: "12%", direction: "up" }}
          comparedTo="vs last month"
          spark={[3, 4, 3.5, 5, 4.8, 6, 6.4, 7]}
          href="#data"
          action="Open reports"
        />
        <MetricCard
          label="Feed cost"
          icon={<Wheat />}
          value="₦2,310,000"
          delta={{ value: "6%", direction: "up" }}
          invert
          comparedTo="vs last month"
          hint="feed prices rose"
          spark={[5, 5.2, 5.1, 5.6, 5.8, 6, 6.1, 6.3]}
          href="#data"
          action="Open expenses"
        />
      </div>
      <div className="flex flex-wrap items-center gap-6">
        <ProgressRing value={4} total={6} />
        <ProgressRing value={6} total={6} size={64} />
        <span className="flex items-center gap-2">
          <Avatar name="Musa Bello" />
          <Avatar name="Chicken Republic" shape="square" />
        </span>
        <Menu
          label="Batch actions"
          trigger={({ ref, ...props }) => (
            <Button ref={ref} variant="secondary" size="sm" {...props}>
              Batch actions
            </Button>
          )}
        >
          <MenuLabel>B-2026-07</MenuLabel>
          <MenuItem icon={<Skull />} onSelect={() => toast("Logged 3 deaths")}>
            Record deaths
          </MenuItem>
          <MenuItem icon={<Truck />} onSelect={() => toast("Sale started")}>
            Start a sale
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<Trash2 />} tone="danger" onSelect={() => toast("Deleted")}>
            Delete batch
          </MenuItem>
        </Menu>
      </div>
      <Panel
        title="Invoices"
        description="Waiting for payment."
        actions={<Button size="sm">New invoice</Button>}
        flush
        footer={<span>2 unpaid · ₦1,325,000</span>}
      >
        <ul className="divide-y divide-line text-sm">
          {(
            [
              ["Chicken Republic, Lekki", "INV-2026-0014", "₦875,000", "Overdue", "danger"],
              ["The Grill Lounge", "INV-2026-0017", "₦450,000", "Due 2 Dec", "warning"],
            ] as const
          ).map(([name, id, amount, due, tone]) => (
            <li key={id} className="flex items-center gap-4 px-5 py-3.5">
              <Avatar name={name} shape="square" size={36} />
              <span className="min-w-0 flex-1 space-y-1">
                <span className="block truncate font-semibold text-fg">{name}</span>
                <IdText value={id} />
              </span>
              <span className="num font-semibold text-fg">{amount}</span>
              <Badge tone={tone}>{due}</Badge>
            </li>
          ))}
        </ul>
      </Panel>
      <div className="space-y-2">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-11 w-full" />
      </div>
      <Card>
        <EmptyState
          icon={<Egg />}
          title="No batches yet"
          description="A batch is one group of day-old chicks, from placement to sale. Add your first to start tracking it."
          action={
            <Button size="sm">
              <Plus /> New batch
            </Button>
          }
        />
      </Card>
    </>
  );
}

function OverlaysDemo() {
  const [modal, setModal] = React.useState(false);
  const [sheet, setSheet] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);
  const [popover, setPopover] = React.useState(false);
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={() => setModal(true)}>
          Open a modal
        </Button>
        <Button variant="secondary" onClick={() => setSheet(true)}>
          Open a sheet
        </Button>
        <Button variant="secondary" onClick={() => setConfirm(true)}>
          Confirm a delete
        </Button>
        <Popover
          open={popover}
          onOpenChange={setPopover}
          label="What is FCR?"
          align="start"
          anchor={
            <Button variant="secondary" aria-expanded={popover} onClick={() => setPopover((o) => !o)}>
              What is FCR?
            </Button>
          }
        >
          <p className="text-sm font-bold text-fg-heading">Feed conversion ratio</p>
          <p className="mt-1 text-sm leading-6 text-fg-muted">
            Kilograms of feed eaten per kilogram of live weight gained. Lower is better: 1.6 means 1.6 kg of feed made 1
            kg of chicken.
          </p>
        </Popover>
        <Button variant="secondary" onClick={() => toast.success("Expense recorded.")}>
          Toast
        </Button>
        <span className="text-sm text-fg-muted">
          Search <Kbd>⌘</Kbd> <Kbd>K</Kbd>
        </span>
      </div>
      <Modal open={modal} onClose={() => setModal(false)} title="Record deaths">
        <div className="space-y-4">
          <p className="text-sm text-fg-muted">
            Batch <code className="text-fg">B-2026-07</code>, day 24. 785 birds alive this morning.
          </p>
          <label className="grid gap-1.5">
            <span className="text-sm font-semibold text-fg">Birds that died today</span>
            <Input type="number" inputMode="numeric" defaultValue="3" />
          </label>
          <Button fullWidth onClick={() => setModal(false)}>
            Record 3 deaths
          </Button>
        </div>
      </Modal>
      <Sheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="Starter feed, 25 kg bag"
        subtitle="12 bags left · reorder at 10"
        footer={
          <Button fullWidth>
            <PackageOpen /> Record a purchase
          </Button>
        }
      >
        <p className="text-sm text-fg-muted">One row up close: a right-hand panel from md, a bottom sheet on phones.</p>
      </Sheet>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Delete this batch?"
        description="Its daily logs, health records and costs are deleted too. This can't be undone."
        confirmLabel="Delete batch"
        typeToConfirm="B-2026-07"
        onConfirm={() => new Promise((r) => setTimeout(r, 800))}
      />
    </>
  );
}
