import { cn } from '@/lib/utils';

interface Props {
  children: React.ReactNode;
  className?: string;
}

/** Contenedor de página: una columna, `max-w-5xl`, padding lateral. */
export function PageShell({ children, className }: Props) {
  return (
    <main
      className={cn(
        'mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-6 sm:py-8',
        className,
      )}
    >
      {children}
    </main>
  );
}

interface HeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}

export function PageHeader({ title, description, action }: HeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="text-muted-foreground text-sm">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
