"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Box, Check, ChevronRight, Cpu, Download, Glasses, ImagePlus, LoaderCircle, ScanLine, ShieldCheck, Sparkles, Upload } from "lucide-react";
import Link from "next/link";

import { AiModelViewer } from "@/components/ai-model-viewer";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

const views = ["Chính diện", "Bên trái", "Bên phải", "Mặt sau"];
type Photo = { name: string; preview: string; data: string; width: number; height: number };
type JobState = "idle" | "submitting" | "processing" | "ready" | "error";
type ConfigureResponse = { configured?: boolean };
type CreateResponse = { taskId?: string; error?: string };
type PollResponse = { status?: string; progress?: number; modelUrl?: string; error?: string };

export default function Scan3DPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef<Photo[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [jobState, setJobState] = useState<JobState>("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [modelUrl, setModelUrl] = useState("");

  useEffect(() => {
    fetch("/api/reconstruct").then((response) => response.json() as Promise<ConfigureResponse>).then((data) => setConfigured(Boolean(data.configured))).catch(() => setConfigured(false));
    return () => photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.preview));
  }, []);

  async function receivePhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).slice(0, 4);
    if (!files.length) return;
    photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.preview));
    setMessage("");
    setModelUrl("");
    setJobState("idle");
    const next = await Promise.all(files.map(preparePhoto));
    photosRef.current = next;
    setPhotos(next);
    event.target.value = "";
  }

  async function createModel() {
    if (photos.length < 2 || !configured) return;
    setJobState("submitting");
    setMessage("Đang gửi bốn góc kính sang AI reconstruction…");
    try {
      const response = await fetch("/api/reconstruct", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ images: photos.map((photo) => photo.data) }) });
      const body = await response.json() as CreateResponse;
      if (!response.ok) throw new Error(body.error || "Không thể tạo tác vụ 3D.");
      if (!body.taskId) throw new Error("Máy chủ không trả về mã tác vụ 3D.");
      setJobState("processing");
      await pollTask(body.taskId);
    } catch (error) {
      setJobState("error");
      setMessage(error instanceof Error ? error.message : "Không thể tạo mô hình 3D.");
    }
  }

  async function pollTask(taskId: string) {
    for (let attempt = 0; attempt < 120; attempt++) {
      const response = await fetch(`/api/reconstruct?taskId=${encodeURIComponent(taskId)}`, { cache: "no-store" });
      const body = await response.json() as PollResponse;
      if (!response.ok) throw new Error(body.error || "Không thể đọc tiến độ AI.");
      setProgress(body.progress ?? 0);
      setMessage(body.status === "PENDING" ? "Tác vụ đang chờ GPU…" : `AI đang dựng hình học và texture PBR · ${body.progress ?? 0}%`);
      if (body.status === "SUCCEEDED" && body.modelUrl) {
        setModelUrl(body.modelUrl);
        setProgress(100);
        setJobState("ready");
        setMessage("Mô hình GLB có texture đã sẵn sàng.");
        localStorage.setItem("kinh3d.aiModelUrl", body.modelUrl);
        localStorage.setItem("kinh3d.aiModelCreatedAt", new Date().toISOString());
        return;
      }
      if (body.status && ["FAILED", "CANCELED"].includes(body.status)) throw new Error(body.error || "AI không thể tái tạo mô hình từ bộ ảnh này.");
      await new Promise((resolve) => window.setTimeout(resolve, 5000));
    }
    throw new Error("Tác vụ mất quá nhiều thời gian. Bạn có thể thử lại sau.");
  }

  return (
    <main className="min-h-screen bg-[#07110f] text-[#eaf5ef]">
      <header className="border-b border-white/10 bg-[#07110f]/92 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1450px] items-center justify-between px-5 py-4 lg:px-8"><Link href="/" className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#bdfc6a] text-[#07110f]"><Glasses className="size-5" /></span><span><span className="block font-semibold">Kính 3D & AI</span><span className="block text-xs text-[#91a79d]">AI Scan Studio</span></span></Link><div className="hidden items-center gap-2 text-sm text-[#91a79d] md:flex"><span className="text-white">Quét ảnh thật</span><ChevronRight className="size-4" /><span>Dựng GLB</span><ChevronRight className="size-4" /><span>Thử lên mặt</span></div><Link href="/try-on" className="rounded-lg border border-white/12 bg-white/5 px-3 py-2 text-sm text-[#b7c7bf] hover:bg-white/10 hover:text-white">Virtual try-on</Link></div>
      </header>

      <div className="mx-auto grid max-w-[1450px] gap-5 px-5 py-6 lg:grid-cols-[360px_minmax(0,1fr)] lg:px-8">
        <aside className="space-y-4">
          <section className="rounded-3xl border border-white/10 bg-[#0b1815] p-5">
            <p className="text-xs font-semibold tracking-[.16em] text-[#63dbc0]">BỘ ẢNH MULTI-VIEW</p><h1 className="mt-2 text-2xl font-semibold tracking-[-.03em] text-white">Tái tạo kính từ ảnh thật</h1><p className="mt-2 text-sm leading-6 text-[#839a90]">Chọn 2–4 ảnh của cùng một chiếc kính. Kết quả tốt nhất khi nền trơn và ánh sáng đều.</p>
            <div className="mt-5 grid grid-cols-2 gap-2">{views.map((view, index) => <button key={view} onClick={() => inputRef.current?.click()} className="relative aspect-[4/3] overflow-hidden rounded-xl border border-dashed border-white/15 bg-black/15">{photos[index] ? <img src={photos[index].preview} alt={view} className="size-full object-cover" /> : <span className="grid size-full place-items-center"><ImagePlus className="size-5 text-[#52675e]" /></span>}<span className="absolute inset-x-0 bottom-0 bg-black/70 px-2 py-1.5 text-xs text-white">{view}</span></button>)}</div>
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={receivePhotos} className="hidden" />
            <Button onClick={() => inputRef.current?.click()} variant="outline" className="mt-3 w-full border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"><Upload /> Chọn tối đa 4 ảnh</Button>
            <div className="mt-4 rounded-xl border border-white/8 bg-black/15 p-3 text-xs leading-5 text-[#70857c]">Ảnh được nén còn tối đa 1280 px trước khi gửi. Khi chạy API, ảnh sẽ được chuyển tới Meshy để tái tạo 3D.</div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#0b1815] p-4">
            <div className="flex items-center justify-between text-sm"><span className="text-[#91a79d]">Meshy API</span><span className={configured ? "text-[#bdfc6a]" : "text-amber-300"}>{configured === null ? "Đang kiểm tra" : configured ? "Đã kết nối" : "Chờ API key"}</span></div>
            <Button onClick={createModel} disabled={photos.length < 2 || !configured || jobState === "submitting" || jobState === "processing"} className="mt-4 w-full bg-[#bdfc6a] text-[#07110f] hover:bg-[#d0ff91]">{jobState === "submitting" || jobState === "processing" ? <LoaderCircle className="animate-spin" /> : <Sparkles />} Tạo mô hình AI 3D</Button>
            {!configured && configured !== null && <p className="mt-3 text-xs leading-5 text-amber-200/80">Cần thêm khóa MESHY_API_KEY vào máy chủ trước khi chạy. Khóa không được lưu trong trình duyệt.</p>}
            <p className="mt-3 text-xs leading-5 text-[#63786f]">Mỗi lần tạo mô hình có thể sử dụng tín dụng của nhà cung cấp API.</p>
          </section>
        </aside>

        <section className="min-w-0 space-y-4">
          {modelUrl ? <AiModelViewer modelUrl={modelUrl} /> : <div className="grid min-h-[560px] place-items-center rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_center,rgba(99,219,192,.09),transparent_55%)]"><div className="max-w-md px-6 text-center"><span className="mx-auto grid size-20 place-items-center rounded-2xl border border-[#63dbc0]/20 bg-[#63dbc0]/8 text-[#63dbc0]"><ScanLine className="size-9" /></span><h2 className="mt-5 text-xl font-medium text-white">Không gian dựng AI</h2><p className="mt-2 text-sm leading-6 text-[#7c9288]">Sau khi nhận ảnh, AI dựng mesh 2K, tạo texture PBR và xuất GLB để kiểm tra từ mọi góc.</p></div></div>}

          {(jobState !== "idle" || message) && <div className={`rounded-2xl border p-4 ${jobState === "error" ? "border-rose-400/20 bg-rose-400/8" : "border-[#63dbc0]/15 bg-[#63dbc0]/6"}`}><div className="flex items-center justify-between text-sm"><span className="text-[#c6d8d0]">{message}</span><span className="text-white">{progress}%</span></div><Progress value={progress} className="mt-3 h-1.5 bg-white/10 [&>div]:bg-[#bdfc6a]" /></div>}

          <div className="grid gap-3 sm:grid-cols-3"><InfoCard icon={<Cpu />} label="Hình học" value="2K reconstruction" /><InfoCard icon={<Box />} label="Đầu ra" value="GLB có PBR" /><InfoCard icon={<ShieldCheck />} label="API key" value="Chỉ ở máy chủ" /></div>
          {jobState === "ready" && <div className="flex flex-wrap gap-3"><Link href="/try-on" className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#bdfc6a] px-5 text-sm font-medium text-[#07110f] hover:bg-[#d0ff91]"><Check className="size-4" /> Dùng mẫu này để thử kính</Link><a href={modelUrl} download className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-white/15 bg-white/5 px-5 text-sm text-white hover:bg-white/10"><Download className="size-4" /> Tải GLB</a></div>}
        </section>
      </div>
    </main>
  );
}

async function preparePhoto(file: File): Promise<Photo> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Không thể nén ảnh.")), "image/jpeg", 0.84));
  const data = await blobToDataUrl(blob);
  bitmap.close();
  return { name: file.name, preview: URL.createObjectURL(blob), data, width, height };
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
}

function InfoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0b1815] p-4"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#63dbc0]/10 text-[#63dbc0]">{icon}</span><span><span className="block text-xs text-[#70857c]">{label}</span><span className="mt-1 block text-sm text-white">{value}</span></span></div>;
}
