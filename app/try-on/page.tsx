"use client";

import { useState, useSyncExternalStore } from "react";
import { Aperture, Box, ChevronRight, Eye, Glasses, Info, Ruler, ScanFace, ScanLine, Smartphone } from "lucide-react";
import Link from "next/link";

import { VirtualTryOn } from "@/components/virtual-try-on";

export default function TryOnPage() {
  const [lensWidth, setLensWidth] = useState(52);
  const [lensHeight, setLensHeight] = useState(41);
  const [bridge, setBridge] = useState(18);
  const [temple, setTemple] = useState(145);
  const [color, setColor] = useState("#66746e");
  const modelUrl = useSyncExternalStore(
    () => () => undefined,
    () => localStorage.getItem("kinh3d.aiModelUrl"),
    () => null,
  );

  return (
    <main className="min-h-screen bg-[#07110f] text-[#eaf5ef]">
      <header className="border-b border-white/10 bg-[#07110f]/92 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-5 py-4 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-[#bdfc6a] text-[#07110f]"><Glasses className="size-5" /></span>
            <span><span className="block font-semibold tracking-tight">Kính 3D & AI</span><span className="block text-xs text-[#91a79d]">Virtual try-on · Bước 2/4</span></span>
          </Link>
          <div className="hidden items-center gap-2 text-sm text-[#91a79d] md:flex"><Link href="/" className="hover:text-white">Tạo kính 3D</Link><ChevronRight className="size-4" /><span className="text-[#dcebe4]">Thử kính</span><ChevronRight className="size-4" /><span>Đo PD</span><ChevronRight className="size-4" /><span>Đo tròng</span></div>
          <a href="/lensmeter" className="rounded-lg border border-white/12 bg-white/5 px-3 py-2 text-sm text-[#b7c7bf] transition hover:bg-white/10 hover:text-white">OptiAxis</a>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-5 px-5 py-5 lg:px-8 lg:py-7 xl:grid-cols-[250px_minmax(0,1fr)_300px]">
        <aside className="order-2 space-y-4 xl:order-1">
          <section className="rounded-2xl border border-white/10 bg-[#0b1815] p-4">
            <p className="mb-4 text-xs font-semibold tracking-[.16em] text-[#63dbc0]">QUY TRÌNH DỰ ÁN</p>
            <ol className="space-y-2">
              <Stage href="/" icon={<Box />} title="Kính 3D" detail="Đã có tài sản" />
              <Stage icon={<ScanFace />} title="Virtual try-on" detail="Đang thực hiện" active />
              <Stage icon={<Eye />} title="Khoảng cách đồng tử" detail="Bước 3" />
              <Stage href="/lensmeter" icon={<Aperture />} title="SPH / CYL / AXIS" detail="Bước 4" />
            </ol>
          </section>
          <section className="rounded-2xl border border-[#63dbc0]/15 bg-[#63dbc0]/6 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-[#c8eee5]"><Smartphone className="size-4" /> Dùng được trên điện thoại</div>
            <p className="mt-2 text-sm leading-6 text-[#83a99f]">Mở cùng địa chỉ website bằng Safari hoặc Chrome, sau đó chọn camera trước để thử kính.</p>
          </section>
        </aside>

        <section className="order-1 min-w-0 xl:order-2">
          <div className="mb-4"><p className="mb-2 text-xs font-semibold tracking-[.18em] text-[#63dbc0]">BƯỚC 2 · CAMERA TRY-ON</p><h1 className="text-3xl font-semibold tracking-[-.04em] text-white md:text-4xl">Đeo kính 3D theo khuôn mặt</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#81988e]">AI bám theo hai mắt, sống mũi và góc quay đầu để đặt gọng theo thời gian thực.</p></div>
          <VirtualTryOn lensWidth={lensWidth} lensHeight={lensHeight} bridge={bridge} temple={temple} color={color} modelUrl={modelUrl} />
        </section>

        <aside className="order-3 space-y-4">
          <section className="rounded-2xl border border-white/10 bg-[#0b1815] p-5">
            <div className="mb-5 flex items-center gap-3"><span className="grid size-9 place-items-center rounded-lg bg-[#63dbc0]/12 text-[#63dbc0]"><Ruler className="size-4" /></span><span><span className="block font-medium text-white">Gọng đang thử</span><span className="block text-xs text-[#70857c]">Kích thước thật · mm</span></span></div>
            <div className="space-y-4">
              <MeasureInput label="Rộng tròng (A)" value={lensWidth} min={40} max={65} onChange={setLensWidth} />
              <MeasureInput label="Cao tròng (B)" value={lensHeight} min={28} max={58} onChange={setLensHeight} />
              <MeasureInput label="Cầu kính (DBL)" value={bridge} min={12} max={28} onChange={setBridge} />
              <MeasureInput label="Càng kính" value={temple} min={120} max={165} onChange={setTemple} />
            </div>
            <div className="mt-5 border-t border-white/10 pt-5"><p className="mb-3 text-sm text-[#b7c7bf]">Màu gọng</p><div className="flex flex-wrap gap-2">{["#66746e", "#8b633e", "#a5a7a4", "#101010", "#274f58"].map((swatch) => <button key={swatch} aria-label={`Màu ${swatch}`} onClick={() => setColor(swatch)} style={{ background: swatch }} className={`size-9 rounded-full border-2 transition ${color === swatch ? "scale-110 border-[#bdfc6a]" : "border-white/15"}`} />)}</div></div>
          </section>
          <section className="rounded-2xl border border-white/10 bg-[#0b1815] p-4"><div className="flex items-center gap-2 text-sm text-white"><ScanLine className="size-4 text-[#63dbc0]" /> Nguồn mô hình</div><p className="mt-2 text-sm text-[#839a90]">{modelUrl ? "Đang dùng GLB do AI tái tạo từ ảnh thật." : "Đang dùng mô hình tham số. Quét ảnh để tạo GLB thật hơn."}</p><Link href="/scan-3d" className="mt-3 inline-flex text-sm font-medium text-[#bdfc6a] hover:text-[#d0ff91]">Mở AI Scan 3D</Link></section>
          <section className="rounded-2xl border border-white/10 bg-[#0b1815] p-4 text-sm leading-6 text-[#8da39a]"><Info className="mr-2 inline size-4 text-[#63dbc0]" />Giữ mặt cách camera khoảng 40–70 cm, ánh sáng chiếu đều và tránh ngược sáng để kính bám ổn định.</section>
        </aside>
      </div>
    </main>
  );
}

function Stage({ icon, title, detail, active, href }: { icon: React.ReactNode; title: string; detail: string; active?: boolean; href?: string }) {
  const content = <><span className={`grid size-9 place-items-center rounded-lg ${active ? "bg-[#bdfc6a] text-[#07110f]" : "bg-white/5 text-[#70857c]"}`}>{icon}</span><span><span className={`block text-sm ${active ? "text-white" : "text-[#a8b9b1]"}`}>{title}</span><span className="block text-xs text-[#63786f]">{detail}</span></span>{active && <span className="ml-auto size-2 rounded-full bg-[#bdfc6a]" />}</>;
  return <li>{href ? <Link href={href} className="flex items-center gap-3 rounded-xl p-2.5 transition hover:bg-white/5">{content}</Link> : <div className={`flex items-center gap-3 rounded-xl p-2.5 ${active ? "bg-[#bdfc6a]/7" : ""}`}>{content}</div>}</li>;
}

function MeasureInput({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return <label className="block"><span className="mb-2 flex justify-between text-sm"><span className="text-[#b7c7bf]">{label}</span><span className="text-white">{value} mm</span></span><input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-full accent-[#bdfc6a]" /></label>;
}
