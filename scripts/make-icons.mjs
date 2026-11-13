// 앱 아이콘 만들기: node scripts/make-icons.mjs
// 원본: scripts/icon-source.png (헤드셋 쓰고 노트북으로 수업 듣는 곰, 정사각형, 투명 없음).
// 원본을 바꾸면 다시 돌려서 결과 PNG를 커밋한다.
import sharp from "sharp";

const SRC = "scripts/icon-source.png";

// 원본 바탕색 (왼쪽 위 한 점)
const { data } = await sharp(SRC).extract({ left: 10, top: 10, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
const bg = { r: data[0], g: data[1], b: data[2] };

// 안드로이드는 아이콘을 동그라미 등으로 자른다 (maskable). 그림을 82%로 줄이고 바탕색으로 채워 가장자리가 잘리지 않게
const SIZE = 1024;
const inner = Math.round(SIZE * 0.82);
const maskable = await sharp({ create: { width: SIZE, height: SIZE, channels: 3, background: bg } })
  .composite([{ input: await sharp(SRC).resize(inner, inner).png().toBuffer(), gravity: "center" }])
  .png()
  .toBuffer();

const rounded = (size) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size * 0.22}"/></svg>`);

const out = [
  // 안드로이드·PC 설치 아이콘 (manifest)
  { file: "public/icon-192.png", src: SRC, size: 192 },
  { file: "public/icon-512.png", src: SRC, size: 512 },
  { file: "public/icon-maskable-512.png", src: maskable, size: 512 },
  // 아이폰 홈 화면 아이콘: 모서리는 아이폰이 둥글게 깎는다
  { file: "src/app/apple-icon.png", src: SRC, size: 180 },
  // 브라우저 탭 아이콘: 모서리를 둥글게
  { file: "src/app/icon.png", src: SRC, size: 64, round: true },
];

for (const { file, src, size, round } of out) {
  let img = sharp(await sharp(src).resize(size, size).png().toBuffer());
  if (round) img = img.composite([{ input: rounded(size), blend: "dest-in" }]);
  await img.png({ compressionLevel: 9 }).toFile(file);
  console.log(file);
}
