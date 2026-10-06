"use client";

import { ChangeEvent, useMemo, useRef, useState } from "react";
import {
  Aperture,
  Box,
  Camera,
  Check,
  ChevronRight,
  CircleGauge,
  Eye,
  Glasses,
  ImagePlus,
  Info,
  Maximize2,
  Ruler,
  ScanFace,
  Upload,
} from "lucide-react";

import { GlassesViewer } from "@/components/glasses-viewer";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

const angleNames = ["Chính diện", "Nghiêng trái", "Nghiêng phải", "Bên trái", "Từ trên"];

export default function ThreeDStudio() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [lensWidth, setLensWidth] = useState(52);
  const [lensHeight, setLensHeight] = useState(41);
  const [bridge, setBridge] = useState(18);
  const [temple, setTemple] = useState(145);
  const [color, setColor] = useState("#66746e");
  const [generated, setGenerated] = useState(false);

  const totalWidth = useMemo(() => lensWidth * 2 + bridge + 12, [lensWidth, bridge]);
  const completeness = Math.min(100, Math.round((photos.length / 5) * 70 + 30));

  function receivePhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).slice(0, 5);
    photos.forEach((url) => URL.revokeObjectURL(url));
    setPhotos(files.map((file) => URL.createObjectURL(file)));
    setGenerated(false);
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
          <a href="/lensmeter" className="rounded-lg border border-white/12 bg-white/5 px-3 py-2 text-sm text-[#b7c7bf] transition hover:bg-white/10 hover:text-white">Mô-đun OptiAxis</a>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1600px] gap-5 px-5 py-5 lg:grid-cols-[260px_minmax(0,1fr)_330px] lg:px-8 lg:py-7">
        <aside className="space-y-4">
          <section className="rounded-2xl border border-white/10 bg-[#0b1815] p-4">
            <p className="mb-4 text-xs font-semibold tracking-[.16em] text-[#63dbc0]">QUY TRÌNH DỰ ÁN</p>
            <ol className="space-y-2">
              <Stage icon={<Box />} title="Kính 3D" detail="Đang thực hiện" active />
              <Stage icon={<ScanFace />} title="Virtual try-on" detail="Bước 2" />
              <Stage icon={<Eye />} title="Khoảng cách đồng tử" detail="Bước 3" />
              <Stage icon={<Aperture />} title="SPH / CYL / AXIS" detail="Bước 4" href="/lensmeter" />
            </ol>
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#0b1815] p-4">
            <div className="mb-3 flex items-center justify-between"><p className="text-sm font-medium text-white">Dữ liệu mẫu kính</p><span className="text-xs text-[#91a79d]">{photos.length}/5 góc</span></div>
            <Progress value={(photos.length / 5) * 100} className="mb-4 h-1.5 bg-white/10 [&>div]:bg-[#bdfc6a]" />
            <div className="grid grid-cols-2 gap-2">
              {angleNames.map((angle, index) => (
                <button key={angle} onClick={() => fileRef.current?.click()} className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-dashed border-white/12 bg-black/15 text-left transition hover:border-[#63dbc0]/50">
                  {photos[index] ? <img src={photos[index]} alt={angle} className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center"><ImagePlus className="size-5 text-[#52675e] group-hover:text-[#63dbc0]" /></span>}
                  <span className="absolute inset-x-0 bottom-0 bg-black/65 px-2 py-1.5 text-[11px] text-[#d8e6df] backdrop-blur-sm">{angle}</span>
                </button>
              ))}
            </div>
            <input ref={fileRef} type="file" accept="image/*" multiple onChange={receivePhotos} className="hidden" />
            <Button variant="outline" onClick={() => fileRef.current?.click()} className="mt-3 w-full border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"><Upload /> Tải 5 ảnh góc kính</Button>
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
            <div className="absolute inset-x-5 bottom-5 z-10 grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-[#07110f]/78 p-3 backdrop-blur-xl sm:grid-cols-5">
              <Metric label="Tròng" value={`${lensWidth} × ${lensHeight}`} />
              <Metric label="Cầu kính" value={`${bridge} mm`} />
              <Metric label="Càng kính" value={`${temple} mm`} />
              <Metric label="Tổng rộng" value={`≈ ${totalWidth} mm`} />
              <Metric label="Tỷ lệ" value="1 : 1" />
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-[#63dbc0]/15 bg-[#63dbc0]/6 p-4 text-sm leading-6 text-[#afd6cc]"><Info className="mr-2 inline size-4 text-[#63dbc0]" />Bản này dựng gọng hình học theo số đo thật để kiểm tra tỷ lệ. Mesh tái tạo trực tiếp từ ảnh sẽ được nối vào cùng trình xem ở bước kế tiếp.</div>
            <div className="rounded-2xl border border-white/10 bg-[#0b1815] p-4"><div className="flex items-center justify-between text-sm"><span className="text-[#91a79d]">Mức hoàn chỉnh dữ liệu</span><span className="font-medium text-white">{completeness}%</span></div><Progress value={completeness} className="mt-3 h-1.5 bg-white/10 [&>div]:bg-[#63dbc0]" /></div>
          </div>
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
            <div className="mt-5 border-t border-white/10 pt-5"><p className="mb-3 text-sm text-[#b7c7bf]">Màu vật liệu</p><div className="flex gap-2">{["#66746e", "#8b633e", "#a5a7a4", "#101010", "#274f58"].map((swatch) => <button key={swatch} aria-label={`Màu ${swatch}`} onClick={() => setColor(swatch)} style={{ background: swatch }} className={`size-8 rounded-full border-2 transition ${color === swatch ? "border-[#bdfc6a] scale-110" : "border-white/15"}`} />)}</div></div>
          </section>

          <section className={`rounded-2xl border p-5 ${generated ? "border-[#bdfc6a]/30 bg-[#10251e]" : "border-white/10 bg-[#0b1815]"}`}>
            <div className="flex items-center gap-3"><CircleGauge className={`size-5 ${generated ? "text-[#bdfc6a]" : "text-[#70857c]"}`} /><div><p className="font-medium text-white">Bản nháp 3D</p><p className="text-xs text-[#70857c]">Parametric frame v0.1</p></div>{generated && <Check className="ml-auto size-5 text-[#bdfc6a]" />}</div>
            <Button onClick={() => setGenerated(true)} className="mt-4 w-full bg-[#bdfc6a] text-[#07110f] hover:bg-[#d0ff91]"><Camera /> {generated ? "Đã cập nhật mô hình" : "Tạo bản nháp 3D"}</Button>
            <p className="mt-3 text-xs leading-5 text-[#63786f]">Ảnh được xử lý tạm thời trên thiết bị trong phiên này và chưa được tải lên máy chủ.</p>
          </section>
        </aside>
      </div>
    </main>
  );
}

function Stage({ icon, title, detail, active, href }: { icon: React.ReactNode; title: string; detail: string; active?: boolean; href?: string }) {
  const content = <><span className={`grid size-9 place-items-center rounded-lg ${active ? "bg-[#bdfc6a] text-[#07110f]" : "bg-white/5 text-[#70857c]"}`}>{icon}</span><span><span className={`block text-sm ${active ? "text-white" : "text-[#a8b9b1]"}`}>{title}</span><span className="block text-xs text-[#63786f]">{detail}</span></span>{active && <span className="ml-auto size-2 rounded-full bg-[#bdfc6a]" />}</>;
  return <li>{href ? <a href={href} className="flex items-center gap-3 rounded-xl p-2.5 transition hover:bg-white/5">{content}</a> : <div className={`flex items-center gap-3 rounded-xl p-2.5 ${active ? "bg-[#bdfc6a]/7" : ""}`}>{content}</div>}</li>;
}

function MeasureInput({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return <label className="block"><span className="mb-2 flex justify-between text-sm"><span className="text-[#b7c7bf]">{label}</span><span className="text-white">{value} mm</span></span><input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className="accent-[#bdfc6a] w-full" /></label>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 text-center"><p className="truncate text-[11px] uppercase tracking-[.08em] text-[#70857c]">{label}</p><p className="mt-1 truncate text-sm font-medium text-[#eaf5ef]">{value}</p></div>;
}
