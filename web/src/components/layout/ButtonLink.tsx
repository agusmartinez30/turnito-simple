import type { VariantProps } from 'class-variance-authority';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Props = React.ComponentProps<typeof Link> &
  VariantProps<typeof buttonVariants>;

/**
 * `next/link` con estilos de `Button`. Se usa en lugar de `<Button render={<Link/>}>`
 * para que el elemento conserve `role="link"` (Base UI le pondría `role="button"`).
 */
export function ButtonLink({ className, variant, size, ...props }: Props) {
  return (
    <Link
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
