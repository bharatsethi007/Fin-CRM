import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '../../src/lib/utils';

/** Renders an accessible form label. */
export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => {
  return <LabelPrimitive.Root ref={ref} className={cn('text-sm font-medium', className)} {...props} />;
});
Label.displayName = LabelPrimitive.Root.displayName;
