"use client";

import { PHOTO_TYPE } from "@/lib/study/rules";

// STUDY-07: 올리기 전에 브라우저에서 줄인다. 긴 쪽 1600px, JPEG.
// 사진의 회전 정보(EXIF)는 요즘 브라우저가 그릴 때 반영한다. 아이폰 HEIC도 사파리가 읽어서 JPEG로 바뀐다

const MAX_SIDE = 1600;
const QUALITY = 0.82;

async function decode(file: File): Promise<CanvasImageSource & { width: number; height: number }> {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // 아래 <img>로 다시 시도
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return Object.assign(img, { width: img.naturalWidth, height: img.naturalHeight });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function resizePhoto(file: File): Promise<Blob> {
  const src = await decode(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(src.width, src.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(src.width * scale));
  canvas.height = Math.max(1, Math.round(src.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  // 투명한 PNG가 검게 나오지 않게 흰 바탕
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  if ("close" in src && typeof src.close === "function") src.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, PHOTO_TYPE, QUALITY));
  if (!blob) throw new Error("toBlob");
  return blob;
}
