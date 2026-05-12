import { cn } from "@/lib/utils";

interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  scrollable?: boolean;
}

export function PageContainer({
  children,
  className,
  scrollable = true,
  ...props
}: PageContainerProps) {
  return (
    <div
      className={cn(
        "h-full w-full bg-gray-50",
        scrollable ? "overflow-auto" : "overflow-hidden",
        className
      )}
      {...props}
    >
      <div className="h-full w-full p-4 md:p-6 lg:p-8">
        {children}
      </div>
    </div>
  );
}
