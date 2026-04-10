import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../src/lib/utils';

const badgeVariants = cva('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', {
  variants: {
    variant: {
      default: 'bg-primary-100 text-primary-800 dark:bg-primary-900/50 dark:text-primary-200',
      secondary: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-100',
      destructive: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
      outline: 'border border-gray-300 text-gray-700 dark:border-gray-600 dark:text-gray-200',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

export type BadgeProps = React.ComponentPropsWithoutRef<'div'> &
  VariantProps<typeof badgeVariants>;

/** Displays compact status and metadata badges. */
export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
