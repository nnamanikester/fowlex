"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Archive, Plus, Tags } from "lucide-react";
import { toast } from "sonner";

import { Field, FormAlert } from "@/components/auth";
import { EmptyState, Fab, Panel } from "@/components/kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Sheet } from "@/components/ui/sheet";
import { type AuthError, apiRequest } from "@/lib/auth/client";
import { type CategoryView, SYSTEM_CATEGORIES, validateCategory } from "@/lib/expenses/categories";
import type { ExpenseView } from "@/lib/expenses/service";
import { formatNaira } from "@/lib/money";

/** The farm's expense categories: their names, monthly budgets, and this month's spend. */
export function CategoriesBoard({
  categories,
  expenses,
  today,
  canManage,
}: {
  categories: CategoryView[];
  expenses: ExpenseView[];
  today: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<CategoryView | "new" | null>(null);
  const [showArchived, setShowArchived] = React.useState(false);
  const month = today.slice(0, 7);
  const spent = new Map<string, number>();
  for (const e of expenses)
    if (e.date.slice(0, 7) === month) spent.set(e.category, (spent.get(e.category) ?? 0) + e.amountKobo);
  const shown = categories.filter((c) => showArchived || !c.archived);

  return (
    <div className="space-y-4">
      {canManage && (
        <Button size="sm" className="hidden lg:inline-flex" onClick={() => setEditing("new")}>
          <Plus /> Add category
        </Button>
      )}
      {shown.length ? (
        <Panel flush>
          <ul className="divide-y divide-line">
            {shown.map((c) => (
              <li key={c.key}>
                <button
                  type="button"
                  disabled={!canManage}
                  onClick={() => setEditing(c)}
                  className="focus-ring flex w-full items-center gap-3 px-5 py-3.5 text-left enabled:hover:bg-surface-subtle"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-fg">{c.name}</span>
                      {c.archived && <Badge>Archived</Badge>}
                      {!c.builtIn && <Badge tone="info">Yours</Badge>}
                    </span>
                    <span className="block text-xs text-fg-muted">
                      {c.monthlyBudgetKobo === null
                        ? "No budget"
                        : `Budget ${formatNaira(c.monthlyBudgetKobo)} a month`}
                    </span>
                  </span>
                  <span className="num shrink-0 text-right">
                    <span className="block font-semibold text-fg">{formatNaira(spent.get(c.key) ?? 0)}</span>
                    <span className="block text-xs text-fg-subtle">this month</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      ) : (
        <Panel>
          <EmptyState icon={<Tags />} title="No categories" description="Add one to sort your spending." />
        </Panel>
      )}
      {categories.some((c) => c.archived) && (
        <button
          type="button"
          className="focus-ring rounded-md text-sm font-medium text-brand-fg"
          onClick={() => setShowArchived((v) => !v)}
        >
          {showArchived ? "Hide archived categories" : "Show archived categories"}
        </button>
      )}
      {canManage && <Fab label="Add category" icon={<Plus />} onClick={() => setEditing("new")} />}
      {editing && (
        <CategorySheet
          key={editing === "new" ? "new" : editing.key}
          category={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null);
            toast.success(message);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function CategorySheet({
  category,
  onClose,
  onSaved,
}: {
  category: CategoryView | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [name, setName] = React.useState(category?.name ?? "");
  const [budget, setBudget] = React.useState<number | null>(category?.monthlyBudgetKobo ?? null);
  const [submitted, setSubmitted] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<AuthError | null>(null);
  const errors = validateCategory({ name, monthlyBudgetKobo: budget });
  const show = (f: "name" | "monthlyBudgetKobo") =>
    submitted && errors[f] ? errors[f] : failure?.field === f ? failure.message : undefined;

  const save = async (archived = category?.archived ?? false) => {
    setSubmitted(true);
    setFailure(null);
    if (Object.keys(errors).length) return;
    setBusy(true);
    try {
      const body = { name, monthlyBudgetKobo: budget, archived };
      if (category) await apiRequest(`/api/expense-categories/${category.key}`, "PATCH", body);
      else await apiRequest("/api/expense-categories", "POST", body);
      onSaved(
        category && archived !== category.archived
          ? archived
            ? `${name.trim()} archived.`
            : `${name.trim()} is back.`
          : category
            ? `${name.trim()} saved.`
            : `${name.trim()} added.`,
      );
    } catch (e) {
      setFailure(e as AuthError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={() => !busy && onClose()}
      title={category ? category.name : "Add a category"}
      subtitle={category ? "Rename it or set its budget" : "Something the farm spends on"}
      footer={
        <div className="space-y-2">
          <Button size="lg" fullWidth loading={busy} onClick={() => void save()}>
            {category ? "Save changes" : "Add category"}
          </Button>
          {category && !SYSTEM_CATEGORIES.includes(category.key) && (
            <Button variant="ghost" fullWidth onClick={() => void save(!category.archived)}>
              <Archive /> {category.archived ? "Use it again" : "Archive"}
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-5">
        {failure && !failure.field && <FormAlert title={failure.message} />}
        <Field
          id="name"
          label="Name"
          error={show("name")}
          hint={category ? "Past expenses take the new name too." : undefined}
        >
          {(a11y) => (
            <Input
              {...a11y}
              value={name}
              maxLength={40}
              placeholder="Security"
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <Field id="monthlyBudgetKobo" label="Monthly budget" error={show("monthlyBudgetKobo")} hint="Optional">
          {(a11y) => <MoneyInput {...a11y} value={budget} onChange={setBudget} placeholder="50,000.00" />}
        </Field>
        {category?.archived === false && (
          <p className="text-sm text-fg-muted">
            Archived categories stay on past expenses but can&apos;t be chosen for new ones.
          </p>
        )}
      </div>
    </Sheet>
  );
}
