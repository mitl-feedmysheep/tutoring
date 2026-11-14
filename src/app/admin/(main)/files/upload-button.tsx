"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MaterialFormModal } from "./material-form";

// PDF 올리기 (FILE-01, 05). 누르면 모달에서 제목·PDF·설명을 적고 올린다
export function UploadButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Upload />
        PDF 올리기
      </Button>
      {open && <MaterialFormModal onClose={() => setOpen(false)} />}
    </>
  );
}
