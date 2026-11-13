"use client";

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

// 아래에서 올라오는 확인창 (시안의 sheet). 수업 취소, 하루에 수업이 둘일 때 고르기
export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="mx-auto max-w-lg gap-3 rounded-t-2xl border-0 px-4 pt-2.5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]"
      >
        <div className="mx-auto h-1 w-9 rounded-full bg-border" />
        <SheetTitle className="text-lg font-bold">{title}</SheetTitle>
        {description ? <SheetDescription className="-mt-2 text-sm leading-relaxed">{description}</SheetDescription> : <SheetDescription className="sr-only">{title}</SheetDescription>}
        {children}
      </SheetContent>
    </Sheet>
  );
}
