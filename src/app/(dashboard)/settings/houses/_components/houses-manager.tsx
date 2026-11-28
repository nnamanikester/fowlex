"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useFormik } from "formik";
import { Plus, Sparkles, Trash2, Warehouse } from "lucide-react";
import { toast } from "sonner";

import { Field, useFocusFirstError } from "@/components/auth";
import { ConfirmDialog, EmptyState, Fab, Panel } from "@/components/kit";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { Sheet } from "@/components/ui/sheet";
import { type AuthError, apiRequest } from "@/lib/auth/client";
import {
  type HouseInput,
  STATUS_LABELS,
  suggestedCapacity,
  SYSTEM_LABELS,
  validateHouse,
  VENTILATION_LABELS,
} from "@/lib/houses/rules";
import type { HouseView } from "@/lib/houses/service";

const STATUS_TONE: Record<HouseInput["status"], BadgeTone> = {
  active: "success",
  maintenance: "warning",
  retired: "neutral",
};
const count = (n: number) => n.toLocaleString("en-NG");

/** The farm's houses as cards, each opening a sheet to edit it. Owners only. */
export function HousesManager({ houses, density }: { houses: HouseView[]; density: number }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<HouseView | "new" | null>(null);
  const inUse = houses.filter((h) => h.status === "active");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">
          {houses.length ? (
            <>
              <span className="num font-semibold text-fg">{inUse.length}</span> in use ·{" "}
              <span className="num font-semibold text-fg">{count(inUse.reduce((n, h) => n + h.capacity, 0))}</span>{" "}
              birds of space
            </>
          ) : (
            "Batches are placed in houses. Add each house (pen) on the farm."
          )}
        </p>
        <Button size="sm" className="hidden lg:inline-flex" onClick={() => setEditing("new")}>
          <Plus /> Add house
        </Button>
      </div>

      {houses.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<Warehouse />}
            title="No houses yet"
            description="Add each house with how many birds it holds. Batches are placed in them."
            action={
              <Button size="sm" onClick={() => setEditing("new")}>
                <Plus /> Add a house
              </Button>
            }
          />
        </Panel>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {houses.map((house) => (
            <li key={house.id}>
              <button
                type="button"
                onClick={() => setEditing(house)}
                aria-label={`${house.name}, ${count(house.capacity)} birds, ${STATUS_LABELS[house.status]}. Edit`}
                className="focus-ring flex w-full flex-col gap-3 rounded-xl border border-line bg-surface p-4 text-left shadow-card transition-colors hover:border-line-strong active:bg-surface-subtle"
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="text-lg font-bold text-fg-heading">{house.name}</span>
                  <Badge tone={STATUS_TONE[house.status]}>{STATUS_LABELS[house.status]}</Badge>
                </span>
                <span className="num text-2xl font-semibold text-fg">
                  {count(house.capacity)} <span className="text-sm font-normal text-fg-muted">birds</span>
                </span>
                <span className="text-xs text-fg-subtle">
                  {[
                    house.floorAreaSqm ? `${count(house.floorAreaSqm)} m²` : null,
                    house.floorAreaSqm ? `${(house.capacity / house.floorAreaSqm).toFixed(1)} birds/m²` : null,
                    SYSTEM_LABELS[house.system],
                    VENTILATION_LABELS[house.ventilation].split(" (")[0],
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Fab label="Add house" icon={<Plus />} onClick={() => setEditing("new")} />

      <HouseSheet
        house={editing}
        density={density}
        onClose={() => setEditing(null)}
        onSaved={(message) => {
          setEditing(null);
          toast.success(message);
          router.refresh();
        }}
      />
    </div>
  );
}

const EMPTY: HouseInput = {
  name: "",
  capacity: Number.NaN,
  floorAreaSqm: null,
  system: "deep-litter",
  ventilation: "open-sided",
  status: "active",
  notes: "",
};

function HouseSheet({
  house,
  density,
  onClose,
  onSaved,
}: {
  house: HouseView | "new" | null;
  density: number;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const isNew = house === "new";
  const current = house && house !== "new" ? house : null;
  const [failure, setFailure] = React.useState<AuthError | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const form = useFormik<HouseInput>({
    enableReinitialize: true,
    initialValues: current
      ? {
          name: current.name,
          capacity: current.capacity,
          floorAreaSqm: current.floorAreaSqm,
          system: current.system,
          ventilation: current.ventilation,
          status: current.status,
          notes: current.notes,
        }
      : EMPTY,
    validate: (values) => validateHouse(values),
    onSubmit: async (values, helpers) => {
      setFailure(null);
      try {
        if (current) await apiRequest(`/api/houses/${current.id}`, "PATCH", { ...values, version: current.version });
        else await apiRequest("/api/houses", "POST", values);
        onSaved(current ? `${values.name.trim()} saved.` : `${values.name.trim()} added.`);
        helpers.resetForm();
      } catch (e) {
        const error = e as AuthError;
        if (error.field) helpers.setFieldError(error.field, error.message);
        else setFailure(error);
      }
    },
  });
  useFocusFirstError(form, ["name", "floorAreaSqm", "capacity", "notes"]);

  // Each opening starts clean.
  const key = isNew ? "new" : (current?.id ?? "");
  const [shown, setShown] = React.useState(key);
  if (key !== shown) {
    setShown(key);
    setFailure(null);
  }

  const error = (name: keyof HouseInput) =>
    (form.submitCount > 0 || form.touched[name]) && typeof form.errors[name] === "string"
      ? form.errors[name]
      : undefined;
  const numberValue = (v: number | null) => (v === null || !Number.isFinite(v) ? "" : String(v));
  const suggestion = suggestedCapacity(form.values.floorAreaSqm, density);

  return (
    <>
      <Sheet
        open={house !== null}
        onClose={() => !form.isSubmitting && onClose()}
        title={current ? current.name : "Add a house"}
        subtitle={current ? "Edit house" : "Where batches are placed"}
        footer={
          <div className="space-y-2">
            <ActionFeedback action={{ failure }} />
            <div className="flex items-center gap-2">
              {current && (
                <Button
                  variant="ghost"
                  className="text-danger-fg"
                  disabled={form.isSubmitting}
                  onClick={() => setDeleting(true)}
                >
                  <Trash2 /> Delete
                </Button>
              )}
              <Button type="submit" form="house-form" fullWidth loading={form.isSubmitting} size="lg">
                {current ? "Save changes" : "Add house"}
              </Button>
            </div>
          </div>
        }
      >
        <form id="house-form" noValidate onSubmit={form.handleSubmit} className="space-y-5">
          <Field id="name" label="Name" error={error("name")}>
            {(a11y) => (
              <Input
                {...a11y}
                {...form.getFieldProps("name")}
                placeholder="House 1"
                autoComplete="off"
                maxLength={40}
              />
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="floorAreaSqm" label="Floor area (m²)" error={error("floorAreaSqm")} hint="Optional">
              {(a11y) => (
                <Input
                  {...a11y}
                  name="floorAreaSqm"
                  inputMode="decimal"
                  className="num"
                  placeholder="120"
                  value={numberValue(form.values.floorAreaSqm)}
                  onBlur={form.handleBlur}
                  onChange={(e) =>
                    void form.setFieldValue("floorAreaSqm", e.target.value === "" ? null : Number(e.target.value))
                  }
                />
              )}
            </Field>
            <Field id="capacity" label="Holds (birds)" error={error("capacity")}>
              {(a11y) => (
                <Input
                  {...a11y}
                  name="capacity"
                  inputMode="numeric"
                  className="num"
                  placeholder="1200"
                  value={numberValue(form.values.capacity)}
                  onBlur={form.handleBlur}
                  onChange={(e) =>
                    void form.setFieldValue("capacity", e.target.value === "" ? Number.NaN : Number(e.target.value))
                  }
                />
              )}
            </Field>
          </div>
          {suggestion !== null && suggestion !== form.values.capacity && (
            <button
              type="button"
              onClick={() => void form.setFieldValue("capacity", suggestion)}
              className="focus-ring -mt-2 flex w-full items-center gap-2 rounded-xl bg-brand-subtle px-3 py-2.5 text-left text-sm text-brand-fg"
            >
              <Sparkles className="size-4 shrink-0" aria-hidden />
              <span>
                At {density} birds/m², {count(form.values.floorAreaSqm ?? 0)} m² holds about{" "}
                <strong className="num">{count(suggestion)}</strong>. <span className="underline">Use it</span>
              </span>
            </button>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field id="system" label="Birds kept on" error={error("system")}>
              {(a11y) => (
                <Select {...a11y} {...form.getFieldProps("system")}>
                  {Object.entries(SYSTEM_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field id="ventilation" label="Ventilation" error={error("ventilation")}>
              {(a11y) => (
                <Select {...a11y} {...form.getFieldProps("ventilation")}>
                  {Object.entries(VENTILATION_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          {current && (
            <Field
              id="status"
              label="Status"
              error={error("status")}
              hint="Under maintenance or retired houses ask for confirmation before a batch goes in."
            >
              {(a11y) => (
                <Select {...a11y} {...form.getFieldProps("status")}>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          <Field
            id="notes"
            label="Notes"
            error={error("notes")}
            hint="Optional: drinkers, feeders, anything to remember."
          >
            {(a11y) => <Textarea {...a11y} {...form.getFieldProps("notes")} rows={2} maxLength={500} />}
          </Field>
        </form>
      </Sheet>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${current?.name ?? "this house"}?`}
        description="It leaves your list of houses. A house that has held batches can't be deleted; retire it instead."
        confirmLabel="Delete house"
        onConfirm={async () => {
          if (!current) return;
          await apiRequest(`/api/houses/${current.id}`, "DELETE");
          onSaved(`${current.name} deleted.`);
        }}
      />
    </>
  );
}
