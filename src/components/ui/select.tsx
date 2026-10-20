'use client';

import type { ComponentProps } from 'react';
import { Select as SelectPrimitive } from 'radix-ui';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const Select = SelectPrimitive.Root;

function SelectTrigger({
  className,
  placeholder,
  ...props
}: ComponentProps<typeof SelectPrimitive.Trigger> & { placeholder?: string }) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        'group/select flex min-h-11 w-full min-w-0 items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary/40 focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-40 [&>span:first-child]:min-w-0 [&>span:first-child]:wrap-anywhere',
        className
      )}
      {...props}
    >
      <SelectPrimitive.Value placeholder={placeholder} />
      <SelectPrimitive.Icon asChild>
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]/select:rotate-180 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position="popper"
        sideOffset={4}
        data-slot="select-content"
        className={cn(
          'z-50 max-h-[var(--radix-select-content-available-height)] w-[var(--radix-select-trigger-width)] min-w-40 overflow-hidden rounded-lg border border-border bg-card text-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 duration-150 motion-reduce:animate-none',
          className
        )}
        {...props}
      >
        <SelectPrimitive.Viewport className="max-h-80 overflow-y-auto p-1">
          {children}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

function SelectItem({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        'relative flex min-h-11 min-w-0 cursor-default select-none items-center rounded-md border border-transparent py-2 pr-3 pl-8 text-sm wrap-anywhere outline-none data-[highlighted]:bg-secondary data-[state=checked]:border-accent data-[state=checked]:bg-accent/20 data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
        className
      )}
      {...props}
    >
      <span className="absolute left-2 flex size-4 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="size-4" aria-hidden="true" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

export { Select, SelectTrigger, SelectContent, SelectItem };
