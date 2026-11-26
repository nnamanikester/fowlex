"use client";

import * as React from "react";
import { FileText, UploadCloud, X } from "lucide-react";

import { cn } from "@/lib/utils";

const MB = 1024 * 1024;

function matches(file: File, accept: string) {
  return accept
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .some((a) =>
      a.startsWith(".")
        ? file.name.toLowerCase().endsWith(a)
        : a.endsWith("/*")
          ? file.type.startsWith(a.slice(0, -1))
          : file.type === a,
    );
}

const size = (bytes: number) =>
  bytes < MB ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / MB).toFixed(1)} MB`;

/**
 * Receipts and signed contracts: drop files here, or tap to choose (on a phone that offers the
 * camera). Checks the type and size before accepting, and lists what's attached with a preview and
 * a remove button. Uploading is the form's job (Vercel Blob, step 4.2); this only picks the files.
 */
export function FileDrop({
  files,
  onChange,
  label = "Attach files",
  hint = "Photos or PDFs, up to 10 MB each",
  accept = "image/*,application/pdf",
  maxSizeMB = 10,
  multiple = true,
  disabled,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  label?: string;
  hint?: string;
  accept?: string;
  maxSizeMB?: number;
  multiple?: boolean;
  disabled?: boolean;
}) {
  const [dragging, setDragging] = React.useState(false);
  const [errors, setErrors] = React.useState<string[]>([]);
  const hintId = React.useId();

  const add = (list: FileList | null) => {
    if (!list) return;
    const problems: string[] = [];
    const ok = Array.from(list).filter((file) => {
      if (!matches(file, accept)) problems.push(`${file.name} isn't a photo or PDF.`);
      else if (file.size > maxSizeMB * MB)
        problems.push(`${file.name} is ${size(file.size)}; the limit is ${maxSizeMB} MB.`);
      else return true;
      return false;
    });
    setErrors(problems);
    if (ok.length) onChange(multiple ? [...files, ...ok] : ok.slice(0, 1));
  };

  return (
    <div className="space-y-2">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled) add(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-line-strong bg-surface px-4 py-6 text-center transition-colors focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15 hover:border-fg-subtle/60",
          dragging && "border-brand bg-brand-subtle",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        <UploadCloud className="size-6 text-fg-subtle" aria-hidden />
        <span className="text-sm font-semibold text-fg">
          {label}
          <span className="font-normal text-fg-muted"> · drop here or tap to choose</span>
        </span>
        <span id={hintId} className="text-xs text-fg-subtle">
          {hint}
        </span>
        <input
          type="file"
          className="sr-only"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          aria-describedby={hintId}
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      {errors.length > 0 && (
        <ul role="alert" className="space-y-0.5 text-xs font-medium text-danger-fg">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      {files.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface" aria-label="Attached files">
          {files.map((file, i) => (
            <li key={`${file.name}-${file.lastModified}-${i}`} className="flex items-center gap-3 px-3 py-2">
              <Thumb file={file} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-fg">{file.name}</span>
                <span className="text-xs text-fg-subtle">{size(file.size)}</span>
              </span>
              <button
                type="button"
                onClick={() => onChange(files.filter((_, j) => j !== i))}
                aria-label={`Remove ${file.name}`}
                className="focus-ring grid size-8 place-items-center rounded-lg text-fg-subtle hover:bg-surface-subtle hover:text-fg"
              >
                <X className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * A photo's thumbnail, or a document icon. Each effect run makes its own object URL and frees it
 * on cleanup, so a re-run (React runs effects twice in development) never leaves a dead URL.
 */
function Thumb({ file }: { file: File }) {
  const img = React.useRef<HTMLImageElement>(null);
  const isImage = file.type.startsWith("image/");
  React.useEffect(() => {
    if (!isImage || !img.current) return;
    const url = URL.createObjectURL(file);
    img.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file, isImage]);
  return isImage ? (
    // eslint-disable-next-line @next/next/no-img-element -- a local preview, not a served image
    <img ref={img} alt="" className="size-10 shrink-0 rounded-lg bg-surface-subtle object-cover ring-1 ring-line" />
  ) : (
    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-surface-subtle text-fg-subtle">
      <FileText className="size-5" aria-hidden />
    </span>
  );
}
