import { ReactNode, RefObject } from "react";

interface AppShellProps {
  header: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  contentRef?: RefObject<HTMLElement>;
}

export function AppShell({ header, children, footer, contentRef }: AppShellProps) {
  return (
    <div className="h-screen bg-background flex flex-col">
      {/* Fixed Header */}
      <div className="flex-shrink-0">
        {header}
      </div>

      {/* Scrollable Content Area */}
      <main ref={contentRef} className="flex-1 overflow-auto">
        {children}
      </main>

      {/* Fixed Footer */}
      {footer && (
        <div className="flex-shrink-0">
          {footer}
        </div>
      )}
    </div>
  );
}
