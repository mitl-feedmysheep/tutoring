"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { replaceTo } from "@/components/app/nav";
import { Camera, Loader2, Minus, Plus, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { deleteStudyLogAction, prepareStudyUploadsAction, saveStudyLogAction } from "@/app/study-actions";
import { useBullets } from "@/components/notes/use-bullets";
import { useNoteDraft } from "@/components/notes/use-note-draft";
import { BottomSheet } from "@/components/app/lessons/bottom-sheet";
import { cleanNote, NOTE_MAX } from "@/lib/lessons/note-text";
import { ENTRY_MAX_MINUTES, MINUTE_STEP, minutesText, PHOTO_MAX, PHOTO_TYPE } from "@/lib/study/rules";
import { cn } from "@/lib/utils";
import { PhotoViewer } from "./photo-viewer";
import { resizePhoto } from "./resize";

export type EntryView = { id: string; minutes: number; memo: string; feedback: string; photos: { id: string; url: string }[] };

type Photo =
  | { key: string; kind: "saved"; id: string; url: string }
  | { key: string; kind: "upload"; url: string; token: string | null };

const NEW_MINUTES = 30;
const QUICK = [10, 30, 60];

const cta = "flex h-12 items-center justify-center rounded-xl border-[1.5px] text-[15px] font-bold transition-colors disabled:opacity-50";

let seq = 0;

/**
 * 공부 기록 한 건 (STUDY-01, 07, 09, APP-03, 14). entry가 없으면 새 기록.
 * locked: 그저께부터는 칸을 잠그고 저장을 끈다. 저장하면 공부 탭으로 돌아간다
 */
export function EntryEditor({
  date,
  entry,
  draftKey,
  locked,
  index,
  onCreated,
}: {
  date: string;
  entry: EntryView | null;
  draftKey: string;
  locked: boolean;
  index: number;
  onCreated?: () => void;
}) {
  const savedMemo = entry?.memo ?? "";
  const savedFeedback = entry?.feedback ?? "";
  const savedMinutes = entry?.minutes ?? NEW_MINUTES;
  const savedPhotos = entry?.photos.map((p) => p.id).join(",") ?? "";

  const [minutes, setMinutes] = useState(savedMinutes);
  const { value: memo, setValue: setMemo, props: memoProps } = useBullets(savedMemo);
  const { value: feedback, setValue: setFeedback, props: feedbackProps } = useBullets(savedFeedback);
  const [photos, setPhotos] = useState<Photo[]>(() => entry?.photos.map((p) => ({ key: p.id, kind: "saved", ...p })) ?? []);
  const [viewing, setViewing] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const draft = useNoteDraft(draftKey, memo, savedMemo, setMemo, "저장하지 않은 기록을 불러왔어요", !locked);
  const feedbackDraft = useNoteDraft(`${draftKey}:feedback`, feedback, savedFeedback, setFeedback, "저장하지 않은 피드백을 불러왔어요", !locked);

  // 미리 보기로 만든 주소는 칸이 없어질 때 정리한다
  const previews = useRef<string[]>([]);
  useEffect(() => () => previews.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const uploading = photos.some((p) => p.kind === "upload" && p.token === null);
  const photoIds = photos.map((p) => (p.kind === "saved" ? p.id : p.key)).join(",");
  const changed = entry === null || minutes !== savedMinutes || cleanNote(memo) !== savedMemo || cleanNote(feedback) !== savedFeedback || photoIds !== savedPhotos;
  const busy = pending || uploading;

  const step = (delta: number) => setMinutes((m) => Math.min(ENTRY_MAX_MINUTES, Math.max(0, m + delta)));

  async function addPhotos(files: File[]) {
    const room = PHOTO_MAX - photos.length;
    if (files.length > room) toast.error(`사진은 한 기록에 ${PHOTO_MAX}장까지 붙일 수 있어요`);
    const picked = files.slice(0, room);
    if (picked.length === 0) return;

    const items = picked.map((file) => {
      const url = URL.createObjectURL(file);
      previews.current.push(url);
      return { key: `up-${++seq}`, kind: "upload" as const, url, token: null, file };
    });
    setPhotos((list) => [...list, ...items.map((i): Photo => ({ key: i.key, kind: "upload", url: i.url, token: null }))]);

    const drop = (keys: string[]) => setPhotos((list) => list.filter((p) => !keys.includes(p.key)));
    const res = await prepareStudyUploadsAction(items.length);
    if (!res.ok) {
      drop(items.map((i) => i.key));
      return void toast.error(res.error);
    }
    const failed: string[] = [];
    await Promise.all(
      items.map(async (item, i) => {
        try {
          const blob = await resizePhoto(item.file);
          const put = await fetch(res.uploads[i].url, { method: "PUT", body: blob, headers: { "Content-Type": PHOTO_TYPE } });
          if (!put.ok) throw new Error(String(put.status));
          setPhotos((list) => list.map((p) => (p.key === item.key ? { ...p, token: res.uploads[i].token } : p)));
        } catch {
          failed.push(item.key);
        }
      }),
    );
    if (failed.length) {
      drop(failed);
      toast.error(`사진 ${failed.length}장을 올리지 못했어요. 다시 골라 주세요`);
    }
  }

  const save = () =>
    start(async () => {
      const res = await saveStudyLogAction({
        id: entry?.id ?? null,
        date,
        minutes,
        memo: cleanNote(memo),
        feedback: cleanNote(feedback),
        photos: photos.map((p) => (p.kind === "saved" ? { fileId: p.id } : { token: p.token })),
      });
      if (!res.ok) return void toast.error(res.error);
      draft.clear();
      feedbackDraft.clear();
      toast.success("공부 기록을 저장했어요");
      onCreated?.();
      // 저장하면 공부 탭으로 돌아간다
      replaceTo(router, "/study");
    });

  const remove = () =>
    start(async () => {
      if (!entry) return;
      const res = await deleteStudyLogAction(entry.id);
      if (!res.ok) return void toast.error(res.error);
      draft.clear();
      feedbackDraft.clear();
      setConfirmDelete(false);
      toast.success("공부 기록을 지웠어요");
    });

  const title = entry ? `기록 ${index + 1}` : "새 기록";

  return (
    <section className="flex flex-col gap-4 rounded-xl bg-card p-4 shadow-[0_0_0_1px_var(--color-border)]">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold">{title}</h2>
        {entry && !locked && (
          <button type="button" onClick={() => setConfirmDelete(true)} className="text-xs font-semibold text-muted-foreground hover:text-red-700">
            지우기
          </button>
        )}
      </div>

      {/* 공부 시간 (5분 단위) */}
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold text-muted-foreground">공부 시간</span>
        <div className="flex items-center justify-between gap-2">
          <StepButton label="5분 빼기" disabled={locked || minutes <= 0} onClick={() => step(-MINUTE_STEP)}>
            <Minus className="size-5" />
          </StepButton>
          <output className={cn("flex-1 text-center text-xl font-bold tabular-nums", minutes === 0 && "text-muted-foreground")} aria-live="polite">
            {minutesText(minutes)}
          </output>
          <StepButton label="5분 더하기" disabled={locked || minutes >= ENTRY_MAX_MINUTES} onClick={() => step(MINUTE_STEP)}>
            <Plus className="size-5" />
          </StepButton>
        </div>
        {!locked && (
          <div className="flex gap-2">
            {QUICK.map((q) => (
              <button
                key={q}
                type="button"
                disabled={minutes + q > ENTRY_MAX_MINUTES}
                onClick={() => step(q)}
                className="h-9 flex-1 rounded-full bg-accent text-[13px] font-bold text-primary transition-opacity disabled:opacity-40"
              >
                +{minutesText(q)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 내용 (APP-14 글머리) */}
      <div className="flex flex-col gap-2">
        <label htmlFor={`memo-${draftKey}`} className="text-[13px] font-semibold text-muted-foreground">
          내용
        </label>
        <textarea
          id={`memo-${draftKey}`}
          {...memoProps}
          disabled={locked}
          maxLength={NOTE_MAX}
          rows={4}
          placeholder={locked ? "내용 없음" : "무엇을 공부했는지 적어요"}
          // iOS는 16px보다 작은 글자 칸을 누르면 화면을 확대한다
          className="min-h-28 w-full resize-none rounded-xl bg-background px-4 py-3 text-base leading-relaxed shadow-[0_0_0_1px_var(--color-border)] outline-none placeholder:text-muted-foreground focus:shadow-[0_0_0_2px_var(--color-primary)] disabled:opacity-70"
        />
      </div>

      {/* 오늘의 피드백 (STUDY-09). 복기할 때 다시 볼 것. 내용 칸처럼 글머리 */}
      {(savedFeedback !== "" || !locked) && (
        <div className="flex flex-col gap-2">
          <label htmlFor={`feedback-${draftKey}`} className="text-[13px] font-semibold text-muted-foreground">
            오늘의 피드백
          </label>
          <textarea
            id={`feedback-${draftKey}`}
            {...feedbackProps}
            disabled={locked}
            maxLength={NOTE_MAX}
            rows={3}
            placeholder="다음에 고칠 점, 기억할 표현을 적어요"
            className="min-h-24 w-full resize-none rounded-xl bg-background px-4 py-3 text-base leading-relaxed shadow-[0_0_0_1px_var(--color-border)] outline-none placeholder:text-muted-foreground focus:shadow-[0_0_0_2px_var(--color-primary)] disabled:opacity-70"
          />
        </div>
      )}

      {/* 사진 (STUDY-07) */}
      {(photos.length > 0 || !locked) && (
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-muted-foreground">
            사진 <span className="tabular-nums">{photos.length}/{PHOTO_MAX}</span>
          </span>
          <div className="grid grid-cols-4 gap-2">
            {photos.map((p, i) => (
              <div key={p.key} className="relative aspect-square overflow-hidden rounded-lg bg-muted">
                <button type="button" onClick={() => setViewing(i)} className="block size-full" aria-label={`사진 ${i + 1} 크게 보기`}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- 서명 URL·미리 보기 주소라 next/image를 쓰지 않는다 */}
                  <img src={p.url} alt="" className="size-full object-cover" />
                </button>
                {p.kind === "upload" && p.token === null && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <Loader2 className="size-5 animate-spin text-white" />
                  </span>
                )}
                {!locked && (
                  <button
                    type="button"
                    onClick={() => setPhotos((list) => list.filter((x) => x.key !== p.key))}
                    aria-label={`사진 ${i + 1} 빼기`}
                    className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
            {!locked && photos.length < PHOTO_MAX && (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-[1.5px] border-dashed border-border text-muted-foreground hover:bg-accent/50"
              >
                <Camera className="size-5" />
                <span className="text-[11px] font-semibold">사진</span>
              </button>
            )}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              const files = Array.from(e.currentTarget.files ?? []);
              e.currentTarget.value = "";
              void addPhotos(files);
            }}
          />
        </div>
      )}

      <button type="button" disabled={locked || !changed || busy || minutes === 0} onClick={save} className={`${cta} border-primary bg-primary text-primary-foreground`}>
        {pending ? "저장하는 중..." : uploading ? "사진 올리는 중..." : "저장"}
      </button>

      <PhotoViewer urls={photos.map((p) => p.url)} index={viewing} onIndexChange={setViewing} />

      <BottomSheet open={confirmDelete} onOpenChange={setConfirmDelete} title="이 기록을 지울까요?" description={`${minutesText(savedMinutes)} 기록과 사진이 같이 지워져요.`}>
        <div className="flex gap-2">
          <button type="button" onClick={() => setConfirmDelete(false)} className={`${cta} flex-1 border-border text-foreground`}>
            그대로 둘게요
          </button>
          <button type="button" disabled={pending} onClick={remove} className={`${cta} flex-1 border-red-600 bg-red-600 text-white`}>
            지우기
          </button>
        </div>
      </BottomSheet>
    </section>
  );
}

function StepButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-primary transition-opacity disabled:opacity-40"
    >
      {children}
    </button>
  );
}
