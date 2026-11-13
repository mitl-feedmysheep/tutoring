import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Cloudflare R2 비공개 버킷 (tutoring-prod). 서명 URL로만 올리고 본다.
// 브라우저가 서명 URL로 R2에 바로 올리므로 버킷 CORS에 앱 주소가 있어야 한다

/** 기능 코드가 쓰는 저장소. 테스트에서는 가짜를 넣는다 */
export type Storage = {
  /** 올리기용 서명 URL (PUT). contentType이 서명에 들어가서 다른 형식으로는 못 올린다 */
  uploadUrl(key: string, contentType: string): Promise<string>;
  /** 보기용 서명 URL (GET). fileName을 주면 브라우저가 그 이름으로 보여 주고 저장한다 (화면에 바로 열기) */
  viewUrl(key: string, fileName?: string): Promise<string>;
  /** 올라간 파일 정보. 없으면 null */
  head(key: string): Promise<{ size: number; contentType: string | null } | null>;
};

const UPLOAD_SECONDS = 10 * 60;
const VIEW_SECONDS = 60 * 60;

let client: S3Client | null = null;

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name}이 없습니다`);
  return value;
}

function s3() {
  return (client ??= new S3Client({
    region: "auto",
    endpoint: env("CLOUDFLARE_R2_ENDPOINT"),
    credentials: { accessKeyId: env("CLOUDFLARE_R2_ACCESS_KEY_ID"), secretAccessKey: env("CLOUDFLARE_R2_SECRET_ACCESS_KEY") },
    forcePathStyle: true,
    // 서명 URL에 체크섬 값을 넣지 않는다. 넣으면 브라우저 PUT이 같은 체크섬을 보내야 해서 실패한다
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  }));
}

const bucket = () => env("CLOUDFLARE_R2_BUCKET_NAME");

/** 한글 파일명도 깨지지 않게 RFC 5987 형식으로. 옛 브라우저용 filename은 영문만 남긴다 */
export function inlineName(fileName: string) {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}

export const r2: Storage = {
  uploadUrl: (key, contentType) => getSignedUrl(s3(), new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }), { expiresIn: UPLOAD_SECONDS }),
  viewUrl: (key, fileName) =>
    getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucket(), Key: key, ResponseContentDisposition: fileName ? inlineName(fileName) : undefined }), {
      expiresIn: VIEW_SECONDS,
    }),
  async head(key) {
    try {
      const res = await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
      return { size: res.ContentLength ?? 0, contentType: res.ContentType ?? null };
    } catch (e) {
      if ((e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
      throw e;
    }
  },
};
