import { ReactNode, forwardRef } from "react";
import { cn } from "@/lib/utils";

interface ScrollableSectionProps {
  children: ReactNode;
  maxHeight?: string;
  className?: string;
}

export const ScrollableSection = forwardRef<HTMLDivElement, ScrollableSectionProps>(
  ({ children, maxHeight = "300px", className }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "overflow-auto rounded-lg border border-border bg-card p-4",
          "scroll-smooth",
          className
        )}
        style={{ maxHeight }}
      >
        {children}
      </div>
    );
  }
);

ScrollableSection.displayName = "ScrollableSection";
