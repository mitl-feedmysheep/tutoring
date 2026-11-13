"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { cleanNote } from "@/lib/lessons/note-text";

// 저장하지 않은 노트를 이 기기(localStorage)에 임시로 둔다. ← 로 나가거나 창을 닫아도 다시 들어오면 이어 쓴다.
// 저장하면 지운다. 저장소를 못 쓰는 브라우저(사생활 보호 모드 등)에서는 조용히 넘어간다

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // 저장소를 못 쓰면 임시 보관 없이 동작한다
  }
}

/** 임시 내용 버리기 (사용자가 저장 안 하고 닫기로 했을 때) */
export function discardNoteDraft(key: string) {
  write(key, null);
}

/** value: 지금 칸의 내용, saved: 서버에 저장된 내용. 돌려주는 clear()는 저장에 성공한 뒤 부른다 */
export function useNoteDraft(key: string, value: string, saved: string, restore: (draft: string) => void) {
  const loaded = useRef(false);

  // 바뀔 때마다 보관한다. 아래 불러오기보다 먼저 선언해서, 처음 그릴 때는 불러오기 전이라 건너뛴다
  useEffect(() => {
    if (!loaded.current) return;
    write(key, cleanNote(value) === saved ? null : value);
  }, [key, value, saved]);

  // 처음 한 번: 남아 있는 임시 내용이 저장된 것과 다르면 불러온다 (서버 화면과 어긋나지 않게 그린 뒤에)
  useEffect(() => {
    const draft = read(key);
    if (draft !== null && cleanNote(draft) !== saved) {
      restore(draft);
      toast("저장하지 않은 노트를 불러왔어요");
    } else if (draft !== null) {
      write(key, null);
    }
    loaded.current = true;
    // 처음 그릴 때만 본다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { clear: () => write(key, null) };
}
