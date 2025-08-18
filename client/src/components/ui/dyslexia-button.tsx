import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const dyslexiaButtonVariants = cva(
  "btn-dyslexia inline-flex items-center justify-center gap-2 whitespace-nowrap text-dyslexia-base font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "btn-dyslexia",
        secondary: "btn-dyslexia-secondary",
        outline: "btn-dyslexia-outline",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "tap-target px-6 py-3",
        sm: "h-10 px-4 py-2",
        lg: "h-16 px-8 py-4 text-dyslexia-lg",
        xl: "h-20 px-10 py-5 text-dyslexia-xl",
        icon: "tap-target w-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface DyslexiaButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof dyslexiaButtonVariants> {
  asChild?: boolean;
}

const DyslexiaButton = React.forwardRef<HTMLButtonElement, DyslexiaButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(dyslexiaButtonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
DyslexiaButton.displayName = "DyslexiaButton";

export { DyslexiaButton, dyslexiaButtonVariants };
