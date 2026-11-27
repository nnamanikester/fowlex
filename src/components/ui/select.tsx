import * as React from "react";
import { ChevronDown } from "lucide-react";

import { inputClasses } from "./input";
import { cn } from "@/lib/utils";

/**
 * A native select, styled like Input. Native on purpose: on a phone it opens the system picker,
 * which is bigger, faster and more accessible than anything drawn in the page.
 */
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select ref={ref} className={cn(inputClasses, "appearance-none pr-10", className)} {...props}>
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
      />
    </div>
  ),
);
Select.displayName = "Select";
