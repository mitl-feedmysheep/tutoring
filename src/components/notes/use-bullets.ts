"use client";

import { useLayoutEffect, useRef, useState } from "react";

// APP-14: 줄마다 "- "로 시작하는 입력 칸. 빈 칸을 처음 누를 때와 줄을 바꿀 때 "- "를 붙인다.
// 빈 글머리 줄에서 줄을 바꾸면 그 "- "를 지운다 (목록 끝내기).
// 키 입력 대신 바뀐 값으로 판단한다: 한글 입력 중 엔터는 기기마다 keydown이 다르게 와서

const BULLET = "- ";

export function useBullets(initial: string) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  const caret = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (caret.current === null || !ref.current) return;
    ref.current.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  });

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    let next = el.value;
    let at = el.selectionStart;
    const newline = next.length === value.length + 1 && el.selectionStart === el.selectionEnd && at > 0 && next[at - 1] === "\n";
    if (newline) {
      const lineStart = next.lastIndexOf("\n", at - 2) + 1;
      const line = next.slice(lineStart, at - 1);
      if (line.trim() === "-") {
        next = next.slice(0, lineStart) + next.slice(at);
        at = lineStart;
      } else {
        next = next.slice(0, at) + BULLET + next.slice(at);
        at += BULLET.length;
      }
      caret.current = at;
    }
    setValue(next);
  }

  function onFocus() {
    if (value !== "") return;
    setValue(BULLET);
    caret.current = BULLET.length;
  }

  return { value, setValue, props: { ref, value, onChange, onFocus } };
}
