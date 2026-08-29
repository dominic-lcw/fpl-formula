import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border border-cyan-300/20 bg-cyan-300/10 px-2 py-0.5 text-xs font-medium text-cyan-100",
        className,
      )}
      {...props}
    />
  );
}
