"use client";

import { ChangeEvent, useMemo, useRef, useState } from "react";
import {
  Aperture, Box, Check, ChevronRight, CircleGauge, Download, Eye, Glasses,
  ImagePlus, Info, LoaderCircle, Maximize2, Ruler, ScanFace, Sparkles, Upload,
} from "lucide-react";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

import { GlassesViewer } from "@/components/glasses-viewer";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { buildGlassesModel, disposeGlassesModel } from "@/lib/glasses-model";

const angleNames = [
  "Chính diện", "Trái 30°", "Phải 30°", "Trái 60°", "Phải 60°", "Bên trái",
  "Bên phải", "Mặt sau", "Từ trên", "Từ dưới", "Càng trái", "Càng phải",
];

type PhotoAnalysis = {
  url: string; name: string; angle: string; width: number; height: number;
  score: number; brightness: number; sharpness: number; color: string;
};

type BuildStatus = "idle" | "analyzing" | "ready";

export default function ThreeDStudio() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<PhotoAnalysis[]>([]);
  const [lensWidth, setLensWidth] = useState(52);
  const [lensHeight, setLensHeight] = useState(41);
  const [bridge, setBridge] = useState(18);
  const [temple, setTemple] = useState(145);
  const [color, setColor] = useState("#66746e");
  const [status, setStatus] = useState<BuildStatus>("idle");
  const [exportState, setExportState] = useState<"idle" | "working" | "done" | "error">("idle");

  const totalWidth = useMemo(() => lensWidth * 2 + bridge + 12, [lensWidth, bridge]);
  const qualityAverage = photos.length ? Math.round(photos.reduce((sum, photo) => sum + photo.score, 0) / photos.length) : 0;
  const goodPhotos = photos.filter((photo) => photo.score >= 65).length;

  async function receivePhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).slice(0, angleNames.length);
    if (!files.length) return;
    setStatus("analyzing");
    photos.forEach((photo) => URL.revokeObjectURL(photo.url));
    try {
      const analyzed = await Promise.all(files.map((file, index) => analyzePhoto(file, angleNames[index])));
      setPhotos(analyzed);
      const suggestedColor = averageHex(analyzed.filter((photo) => photo.score >= 45).map((photo) => photo.color));
      if (suggestedColor) setColor(suggestedColor);
      setStatus("idle");
    } catch {
      setPhotos([]);
      setStatus("idle");
    } finally {
      event.target.value = "";
    }
  }

  function buildDraft() {
    setStatus("analyzing");
    window.setTimeout(() => setStatus("ready"), 900);
  }

  async function exportGlb() {
    setExportState("working");
    const model = buildGlassesModel({ lensWidth, lensHeight, bridge, temple, color });
    const exporter = new GLTFExporter();
    try {
      const result = await new Promise<ArrayBuffer>((resolve, reject) => {
        exporter.parse(model, (value) => {
          if (value instanceof ArrayBuffer) resolve(value);
          else reject(new Error("Không thể tạo tệp GLB"));
        }, reject, { binary: true, onlyVisible: true });
      });
      const href = URL.createObjectURL(new Blob([result], { type: "model/gltf-binary" }));
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = `kinh-${lensWidth}-${bridge}-${temple}.glb`;
      anchor.click();
      URL.revokeObjectURL(href);
      setExportState("done");
    } catch {
      setExportState("error");
    } finally {
      disposeGlassesModel(model);
    }
  }

  return (
    <main className="min-h-screen bg-[#07110f] text-[#eaf5ef]">
      <header className="border-b border-white/10 bg-[#07110f]/92 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-5 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-[#bdfc6a] text-[#07110f]"><Glasses className="size-5" /></div>
            <div><p className="font-semibold tracking-tight">Kính 3D & AI</p><p className="text-xs text-[#91a79d]">Product studio · Bước 1/4</p></div>
          </div>
          <div className="hidden items-center gap-2 text-sm text-[#91a79d] md:flex">
            <span className="text-[#dcebe4]">Tạo kính 3D</span><ChevronRight className="size-4" /><span>Thử kính</span><ChevronRight className="size-4" /><span>Đo PD</span><ChevronRight className="size-4" /><span>Đo tròng</span>
          </div>
          <div className="flex items-center gap-2"><a href="/scan-3d" className="rounded-lg border border-[#63dbc0]/20 bg-[#63dbc0]/8 px-3 py-2 text-sm text-[#9be5d4] transition hover:bg-[#63dbc0]/14">AI Scan 3D</a><a href="/lensmeter" className="rounded-lg border border-white/12 bg-white/5 px-3 py-2 text-sm text-[#b7c7bf] transition hover:bg-white/10 hover:text-white">Mô-đun OptiAxis</a></div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1600px] gap-5 px-5 py-5 lg:grid-cols-[280px_minmax(0,1fr)_330px] lg:px-8 lg:py-7">
        <aside className="space-y-4">
          <section className="rounded-2xl border border-white/10 bg-[#0b1815] p-4">
            <p className="mb-4 text-xs font-semibold tracking-[.16em] text-[#63dbc0]">QUY TRÌNH DỰ ÁN</p>
            <ol className="space-y-2">
              <Stage icon={<Box />} title="Kính 3D" detail="Đang thực hiện" active />
              <Stage icon={<ScanFace />} title="Virtual try-on" detail="Bước 2" href="/try-on" />
              <Stage icon={<Eye />} title="Khoảng cách đồng tử" detail="Bước 3" />
              <Stage icon={<Aperture />} title="SPH / CYL / AXIS" detail="Bước 4" href="/lensmeter" />
            </ol>
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#0b1815] p-4">
            <div className="mb-3 flex items-center justify-between"><p className="text-sm font-medium text-white">Bộ ảnh quét gọng</p><span className="text-xs text-[#91a79d]">{photos.length}/{angleNames.length} góc</span></div>
            <Progress value={(photos.length / angleNames.length) * 100} className="mb-4 h-1.5 bg-white/10 [&>div]:bg-[#bdfc6a]" />
            <div className="grid grid-cols-3 gap-1.5">
              {angleNames.map((angle, index) => {
                const photo = photos[index];
                return (
                  <button key={angle} onClick={() => fileRef.current?.click()} className="group relative aspect-square overflow-hidden rounded-lg border border-dashed border-white/12 bg-black/15 text-left transition hover:border-[#63dbc0]/50">
                    {photo ? <img src={photo.url} alt={angle} className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center"><ImagePlus className="size-4 text-[#52675e] group-hover:text-[#63dbc0]" /></span>}
                    {photo && <span className={`absolute right-1 top-1 rounded px-1 py-0.5 text-[9px] font-semibold ${photo.score >= 65 ? "bg-[#bdfc6a] text-[#07110f]" : "bg-amber-400 text-black"}`}>{photo.score}</span>}
                    <span className="absolute inset-x-0 bottom-0 truncate bg-black/70 px-1.5 py-1 text-[9px] text-[#d8e6df] backdrop-blur-sm">{angle}</span>
                  </button>
                );
              })}
            </div>
            <input ref={fileRef} type="file" accept="image/*" multiple onChange={receivePhotos} className="hidden" />
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={status === "analyzing"} className="mt-3 w-full border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white">
              {status === "analyzing" ? <LoaderCircle className="animate-spin" /> : <Upload />} {status === "analyzing" ? "Đang kiểm tra ảnh" : "Chọn tối đa 12 ảnh"}
            </Button>
            <p className="mt-3 text-[11px] leading-4 text-[#63786f]">Đặt kính trên nền trơn, ánh sáng đều, giữ nguyên khoảng cách ở mọi góc.</p>
          </section>
        </aside>

        <section className="min-w-0">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div><p className="mb-2 text-xs font-semibold tracking-[.18em] text-[#63dbc0]">BƯỚC 1 · TÀI SẢN KÍNH 3D</p><h1 className="text-3xl font-semibold tracking-[-.04em] text-white md:text-4xl">Dựng gọng theo kích thước thật</h1></div>
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-[#91a79d]"><Maximize2 className="size-3.5" /> Kéo để xoay · cuộn để phóng to</div>
          </div>

          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#07100e] shadow-[0_30px_80px_rgba(0,0,0,.28)]">
            <div className="absolute left-5 top-5 z-10 rounded-full border border-[#bdfc6a]/20 bg-[#bdfc6a]/8 px-3 py-1.5 text-xs text-[#bdfc6a]">Mô hình tham số · đơn vị mm</div>
            <GlassesViewer lensWidth={lensWidth} lensHeight={lensHeight} bridge={bridge} temple={temple} color={color} />
            <div className="absolute inset-x-5 bottom-5 z-10 grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-[#07110f]/78 p-3 backdrop-blur-xl xl:grid-cols-5">
              <Metric label="Tròng" value={`${lensWidth} × ${lensHeight}`} /><Metric label="Cầu kính" value={`${bridge} mm`} />
              <Metric label="Càng kính" value={`${temple} mm`} /><Metric label="Tổng rộng" value={`≈ ${totalWidth} mm`} /><Metric label="Tỷ lệ" value="1 : 1" />
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <DataCard label="Độ phủ góc" value={`${photos.length}/${angleNames.length}`} hint={photos.length >= 8 ? "Đủ để dựng thử" : "Cần tối thiểu 8 góc"} />
            <DataCard label="Chất lượng trung bình" value={photos.length ? `${qualityAverage}/100` : "—"} hint={photos.length ? `${goodPhotos} ảnh đạt chuẩn` : "Chưa có dữ liệu"} />
            <DataCard label="Màu gọng gợi ý" value={color.toUpperCase()} hint="Có thể chỉnh thủ công" swatch={color} />
          </div>

          <div className="mt-4 rounded-2xl border border-[#63dbc0]/15 bg-[#63dbc0]/6 p-4 text-sm leading-6 text-[#afd6cc]"><Info className="mr-2 inline size-4 text-[#63dbc0]" />Đây là mô hình tham số theo số đo thật. Phân tích ảnh hiện dùng để kiểm tra đầu vào và gợi ý vật liệu; tái tạo mesh quang trắc chính xác sẽ cần dịch vụ xử lý ảnh phía máy chủ ở giai đoạn tiếp theo.</div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-white/10 bg-[#0b1815] p-5">
            <div className="mb-5 flex items-center gap-3"><div className="grid size-9 place-items-center rounded-lg bg-[#63dbc0]/12 text-[#63dbc0]"><Ruler className="size-4" /></div><div><h2 className="font-medium text-white">Kích thước thực</h2><p className="text-xs text-[#70857c]">ISO frame measurements</p></div></div>
            <div className="space-y-4">
              <MeasureInput label="Rộng tròng (A)" value={lensWidth} min={40} max={65} onChange={setLensWidth} />
              <MeasureInput label="Cao tròng (B)" value={lensHeight} min={28} max={58} onChange={setLensHeight} />
              <MeasureInput label="Cầu kính (DBL)" value={bridge} min={12} max={28} onChange={setBridge} />
              <MeasureInput label="Càng kính" value={temple} min={120} max={165} onChange={setTemple} />
            </div>
            <div className="mt-5 border-t border-white/10 pt-5"><p className="mb-3 text-sm text-[#b7c7bf]">Màu vật liệu</p><div className="flex gap-2">{["#66746e", "#8b633e", "#a5a7a4", "#101010", "#274f58"].map((swatch) => <button key={swatch} aria-label={`Màu ${swatch}`} onClick={() => setColor(swatch)} style={{ background: swatch }} className={`size-8 rounded-full border-2 transition ${color === swatch ? "scale-110 border-[#bdfc6a]" : "border-white/15"}`} />)}</div></div>
          </section>

          <section className={`rounded-2xl border p-5 ${status === "ready" ? "border-[#bdfc6a]/30 bg-[#10251e]" : "border-white/10 bg-[#0b1815]"}`}>
            <div className="flex items-center gap-3"><CircleGauge className={`size-5 ${status === "ready" ? "text-[#bdfc6a]" : "text-[#70857c]"}`} /><div><p className="font-medium text-white">Bản nháp 3D</p><p className="text-xs text-[#70857c]">Parametric frame v0.2</p></div>{status === "ready" && <Check className="ml-auto size-5 text-[#bdfc6a]" />}</div>
            <Button onClick={buildDraft} disabled={status === "analyzing"} className="mt-4 w-full bg-[#bdfc6a] text-[#07110f] hover:bg-[#d0ff91]">
              {status === "analyzing" ? <LoaderCircle className="animate-spin" /> : status === "ready" ? <Check /> : <Sparkles />} {status === "analyzing" ? "Đang xử lý" : status === "ready" ? "Đã cập nhật mô hình" : "Tạo bản nháp 3D"}
            </Button>
            <Button onClick={exportGlb} disabled={exportState === "working"} variant="outline" className="mt-2 w-full border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"><Download /> {exportState === "working" ? "Đang xuất GLB" : "Xuất tệp .glb"}</Button>
            {exportState === "done" && <p className="mt-2 text-xs text-[#bdfc6a]">Đã tạo và tải mô hình GLB.</p>}
            {exportState === "error" && <p className="mt-2 text-xs text-amber-300">Chưa thể xuất GLB. Vui lòng thử lại.</p>}
            <p className="mt-3 text-xs leading-5 text-[#63786f]">Ảnh được phân tích tạm thời trên thiết bị trong phiên này, chưa tải lên máy chủ.</p>
          </section>
        </aside>
      </div>
    </main>
  );
}

async function analyzePhoto(file: File, angle: string): Promise<PhotoAnalysis> {
  const bitmap = await createImageBitmap(file);
  const sampleWidth = Math.min(240, bitmap.width);
  const sampleHeight = Math.max(1, Math.round((bitmap.height / bitmap.width) * sampleWidth));
  const canvas = document.createElement("canvas");
  canvas.width = sampleWidth; canvas.height = sampleHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas unavailable");
  context.drawImage(bitmap, 0, 0, sampleWidth, sampleHeight);
  const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
  let luminanceSum = 0, luminanceSquared = 0, gradientSum = 0;
  let colorR = 0, colorG = 0, colorB = 0, colorSamples = 0;

  for (let y = 0; y < sampleHeight; y += 2) {
    for (let x = 0; x < sampleWidth; x += 2) {
      const index = (y * sampleWidth + x) * 4;
      const r = pixels[index], g = pixels[index + 1], b = pixels[index + 2];
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      luminanceSum += luminance; luminanceSquared += luminance * luminance;
      if (x + 2 < sampleWidth) {
        const next = index + 8;
        gradientSum += Math.abs(r - pixels[next]) + Math.abs(g - pixels[next + 1]) + Math.abs(b - pixels[next + 2]);
      }
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      if (luminance > 24 && luminance < 225 && max - min > 8) {
        colorR += r; colorG += g; colorB += b; colorSamples++;
      }
    }
  }

  const samples = Math.ceil(sampleWidth / 2) * Math.ceil(sampleHeight / 2);
  const brightness = luminanceSum / samples;
  const contrast = Math.sqrt(Math.max(0, luminanceSquared / samples - brightness * brightness));
  const sharpness = gradientSum / Math.max(1, samples);
  const resolutionScore = Math.min(100, (Math.min(bitmap.width, bitmap.height) / 1200) * 100);
  const lightScore = brightness >= 55 && brightness <= 215 ? 100 : Math.max(0, 100 - Math.abs(brightness - 135));
  const contrastScore = Math.min(100, (contrast / 38) * 100);
  const sharpnessScore = Math.min(100, (sharpness / 38) * 100);
  const score = Math.round(resolutionScore * 0.35 + lightScore * 0.2 + contrastScore * 0.2 + sharpnessScore * 0.25);
  const color = colorSamples ? rgbToHex(colorR / colorSamples, colorG / colorSamples, colorB / colorSamples) : "#66746e";
  const analysis = { url: URL.createObjectURL(file), name: file.name, angle, width: bitmap.width, height: bitmap.height, score, brightness: Math.round(brightness), sharpness: Math.round(sharpness), color };
  bitmap.close();
  return analysis;
}

function rgbToHex(red: number, green: number, blue: number) {
  const channel = (value: number) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

function averageHex(colors: string[]) {
  if (!colors.length) return null;
  const totals = colors.reduce((sum, hex) => {
    sum[0] += Number.parseInt(hex.slice(1, 3), 16); sum[1] += Number.parseInt(hex.slice(3, 5), 16); sum[2] += Number.parseInt(hex.slice(5, 7), 16);
    return sum;
  }, [0, 0, 0]);
  return rgbToHex(totals[0] / colors.length, totals[1] / colors.length, totals[2] / colors.length);
}

function Stage({ icon, title, detail, active, href }: { icon: React.ReactNode; title: string; detail: string; active?: boolean; href?: string }) {
  const content = <><span className={`grid size-9 place-items-center rounded-lg ${active ? "bg-[#bdfc6a] text-[#07110f]" : "bg-white/5 text-[#70857c]"}`}>{icon}</span><span><span className={`block text-sm ${active ? "text-white" : "text-[#a8b9b1]"}`}>{title}</span><span className="block text-xs text-[#63786f]">{detail}</span></span>{active && <span className="ml-auto size-2 rounded-full bg-[#bdfc6a]" />}</>;
  return <li>{href ? <a href={href} className="flex items-center gap-3 rounded-xl p-2.5 transition hover:bg-white/5">{content}</a> : <div className={`flex items-center gap-3 rounded-xl p-2.5 ${active ? "bg-[#bdfc6a]/7" : ""}`}>{content}</div>}</li>;
}

function MeasureInput({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return <label className="block"><span className="mb-2 flex justify-between text-sm"><span className="text-[#b7c7bf]">{label}</span><span className="text-white">{value} mm</span></span><input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-full accent-[#bdfc6a]" /></label>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 text-center"><p className="truncate text-[11px] uppercase tracking-[.08em] text-[#70857c]">{label}</p><p className="mt-1 truncate text-sm font-medium text-[#eaf5ef]">{value}</p></div>;
}

function DataCard({ label, value, hint, swatch }: { label: string; value: string; hint: string; swatch?: string }) {
  return <div className="rounded-2xl border border-white/10 bg-[#0b1815] p-4"><p className="text-xs text-[#70857c]">{label}</p><div className="mt-2 flex items-center gap-2">{swatch && <span className="size-3 rounded-full border border-white/20" style={{ background: swatch }} />}<p className="font-medium text-white">{value}</p></div><p className="mt-1 text-[11px] text-[#63786f]">{hint}</p></div>;
}
