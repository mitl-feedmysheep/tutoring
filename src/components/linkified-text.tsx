// 글 안의 https:// 주소를 눌러서 열 수 있는 링크로 보여 준다 (FILE-05). 줄바꿈은 그대로
const URL_RE = /(https?:\/\/[^\s<>"']+)/g;
// 문장 끝 마침표·괄호는 주소에서 뺀다
const TRAILING = /[.,!?)\]}'"]+$/;

export function LinkifiedText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(URL_RE);
  return (
    <p className={`whitespace-pre-line break-words ${className ?? ""}`}>
      {parts.map((part, i) => {
        if (i % 2 === 0) return part;
        const tail = part.match(TRAILING)?.[0] ?? "";
        const url = tail ? part.slice(0, -tail.length) : part;
        return (
          <span key={i}>
            <a href={url} target="_blank" rel="noopener noreferrer" className="break-all text-primary underline underline-offset-2">
              {url}
            </a>
            {tail}
          </span>
        );
      })}
    </p>
  );
}
