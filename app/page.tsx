"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Aperture,
  Camera,
  Check,
  CircleDot,
  FlaskConical,
  Info,
  Play,
  Printer,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type CaptureKind = "reference" | "lens";

const steps = [
  { n: "01", label: "Thiết lập", detail: "Cố định hình học" },
  { n: "02", label: "Hiệu chuẩn", detail: "Ảnh lưới nền" },
  { n: "03", label: "Đo tròng", detail: "Ảnh qua tròng" },
  { n: "04", label: "Kết quả", detail: "SPH · CYL · AXIS" },
];

function quarter(value: number) {
  return Math.round(value * 4) / 4;
}

function formatPower(value: number) {
  const safe = Object.is(value, -0) ? 0 : value;
  return `${safe >= 0 ? "+" : ""}${safe.toFixed(2)} D`;
}

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [referenceImage, setReferenceImage] = useState("");
  const [lensImage, setLensImage] = useState("");
  const [ratioA, setRatioA] = useState(0.96);
  const [ratioB, setRatioB] = useState(0.92);
  const [principalAngle, setPrincipalAngle] = useState(90);
  const [calibration, setCalibration] = useState(25);
  const [analyzed, setAnalyzed] = useState(false);

  const measurement = useMemo(() => {
    const pA = quarter((ratioA - 1) * calibration);
    const pB = quarter((ratioB - 1) * calibration);
    const sphere = Math.max(pA, pB);
    const cylinder = Math.min(pA, pB) - sphere;
    const axis = pA >= pB ? principalAngle : (principalAngle + 90) % 180 || 180;
    const anisotropy = Math.abs(ratioA - ratioB);
    const quality = Math.max(52, Math.min(94, 92 - anisotropy * 220));
    return { sphere, cylinder, axis, quality };
  }, [ratioA, ratioB, principalAngle, calibration]);

  const progress = referenceImage ? (lensImage ? (analyzed ? 100 : 75) : 50) : 25;

  async function startCamera() {
    try {
      setCameraError("");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
    } catch {
      setCameraError("Không mở được camera. Hãy cấp quyền camera hoặc dùng ảnh mẫu.");
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOn(false);
  }

  function capture(kind: CaptureKind) {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) return;
    const maxWidth = 1280;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL("image/jpeg", 0.88);
    if (kind === "reference") setReferenceImage(image);
    else setLensImage(image);
    setAnalyzed(false);
  }

  function loadSample() {
    setReferenceImage("sample-reference");
    setLensImage("sample-lens");
    setRatioA(0.96);
    setRatioB(0.92);
    setPrincipalAngle(90);
    setCalibration(25);
    setAnalyzed(false);
  }

  function reset() {
    setReferenceImage("");
    setLensImage("");
    setAnalyzed(false);
  }

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  return (
    <main className="min-h-screen bg-[#07110f] text-[#eaf5ef]">
      <canvas ref={canvasRef} className="hidden" />
      <header className="border-b border-white/10 bg-[#07110f]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-[#bdfc6a] text-[#07110f] shadow-[0_0_30px_rgba(189,252,106,.18)]">
              <Aperture className="size-5" />
            </div>
            <div>
              <p className="font-semibold tracking-tight">OptiAxis Lab</p>
              <p className="text-xs text-[#91a79d]">Lensmeter prototype · v0.1</p>
            </div>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-[#f6c453]/25 bg-[#f6c453]/8 px-3 py-1.5 text-xs text-[#f7d77f] sm:flex">
            <ShieldAlert className="size-3.5" />
            Nghiên cứu — chưa dùng để kê đơn
          </div>
          <Button variant="outline" size="sm" onClick={reset} className="border-white/15 bg-white/5 text-[#dbe9e2] hover:bg-white/10 hover:text-white">
            <RotateCcw /> Đo mới
          </Button>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-5 px-5 py-5 lg:grid-cols-[240px_minmax(0,1fr)_310px] lg:px-8 lg:py-7">
        <aside className="rounded-2xl border border-white/10 bg-[#0b1815] p-4 lg:sticky lg:top-5 lg:h-[calc(100vh-112px)]">
          <div className="mb-5 flex items-center justify-between text-xs text-[#91a79d]"><span>TIẾN TRÌNH</span><span>{progress}%</span></div>
          <Progress value={progress} className="mb-7 h-1.5 bg-white/10 [&>div]:bg-[#bdfc6a]" />
          <ol className="grid gap-2 sm:grid-cols-4 lg:grid-cols-1">
            {steps.map((step, index) => {
              const activeIndex = progress === 100 ? 3 : Math.floor(progress / 25) - 1;
              const done = index < activeIndex || progress === 100;
              const active = index === activeIndex;
              return (
                <li key={step.n} className={`flex gap-3 rounded-xl border p-3 transition-colors ${active ? "border-[#bdfc6a]/40 bg-[#bdfc6a]/8" : "border-transparent bg-transparent"}`}>
                  <span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${done ? "bg-[#bdfc6a] text-[#07110f]" : active ? "border border-[#bdfc6a] text-[#bdfc6a]" : "border border-white/15 text-[#70857c]"}`}>
                    {done ? <Check className="size-3.5" /> : step.n}
                  </span>
                  <span><span className={`block text-sm ${active ? "text-white" : "text-[#b7c7bf]"}`}>{step.label}</span><span className="mt-0.5 block text-xs text-[#63786f]">{step.detail}</span></span>
                </li>
              );
            })}
          </ol>
          <div className="mt-6 rounded-xl border border-white/8 bg-black/15 p-4 text-xs leading-5 text-[#91a79d]">
            <p className="mb-2 flex items-center gap-2 font-medium text-[#dbe9e2]"><Info className="size-4 text-[#63dbc0]" /> Điều kiện tối thiểu</p>
            Camera, tròng và lưới phải cố định. Khoảng cách thay đổi sẽ làm sai kết quả Diopter.
          </div>
        </aside>

        <section className="min-w-0">
          <div className="mb-5">
            <p className="mb-2 text-xs font-semibold tracking-[0.18em] text-[#63dbc0]">BƯỚC 1 · NGUYÊN MẪU ĐO QUANG HỌC</p>
            <h1 className="max-w-3xl text-3xl font-semibold tracking-[-0.04em] text-white md:text-4xl">Đo biến dạng lưới qua tròng kính</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[#91a79d] md:text-base">Chụp cùng một lưới chấm trước và sau khi đặt tròng. Chênh lệch tỷ lệ theo hai kinh tuyến tạo ra ước tính SPH, CYL và AXIS.</p>
          </div>

          <Tabs defaultValue="capture" className="gap-4">
            <TabsList className="w-full justify-start overflow-x-auto rounded-xl bg-white/5 p-1">
              <TabsTrigger value="capture" className="px-4 data-[state=active]:bg-[#163128] data-[state=active]:text-white">Camera & ảnh đo</TabsTrigger>
              <TabsTrigger value="geometry" className="px-4 data-[state=active]:bg-[#163128] data-[state=active]:text-white">Hình học hiệu chuẩn</TabsTrigger>
              <TabsTrigger value="target" className="px-4 data-[state=active]:bg-[#163128] data-[state=active]:text-white">Lưới chuẩn</TabsTrigger>
            </TabsList>

            <TabsContent value="capture">
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b1815]">
                <div className="relative aspect-[16/9] min-h-[300px] bg-[#030807]">
                  <video ref={videoRef} playsInline muted className={`h-full w-full object-cover ${cameraOn ? "block" : "hidden"}`} />
                  {!cameraOn && <div className="absolute inset-0 grid place-items-center p-7 text-center"><div><div className="mx-auto mb-4 grid size-16 place-items-center rounded-full border border-white/10 bg-white/5 text-[#63dbc0]"><Camera className="size-7" /></div><p className="font-medium text-white">Camera đang tắt</p><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#70857c]">Đặt camera vuông góc với tâm tròng và giữ nguyên vị trí giữa hai lần chụp.</p></div></div>}
                  <div className="pointer-events-none absolute inset-0 grid place-items-center"><div className="relative size-[min(64%,360px)] rounded-full border border-dashed border-[#bdfc6a]/45"><span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-[#bdfc6a]/20" /><span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-[#bdfc6a]/20" /><CircleDot className="absolute left-1/2 top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 text-[#bdfc6a]" /></div></div>
                  <div className="absolute left-4 top-4 rounded-full border border-white/10 bg-black/55 px-3 py-1.5 text-xs text-[#c5d3cc] backdrop-blur">{cameraOn ? "LIVE · căn tâm tròng vào vòng tròn" : "PREVIEW"}</div>
                </div>
                {cameraError && <p className="border-t border-[#f6c453]/20 bg-[#f6c453]/8 px-5 py-3 text-sm text-[#f7d77f]">{cameraError}</p>}
                <div className="grid gap-3 border-t border-white/10 p-4 md:grid-cols-2 xl:grid-cols-4">
                  <Button onClick={cameraOn ? stopCamera : startCamera} className="bg-[#bdfc6a] text-[#07110f] hover:bg-[#d0ff91]"><Play /> {cameraOn ? "Tắt camera" : "Mở camera"}</Button>
                  <Button variant="outline" disabled={!cameraOn} onClick={() => capture("reference")} className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"><Camera /> Chụp lưới nền</Button>
                  <Button variant="outline" disabled={!cameraOn || !referenceImage} onClick={() => capture("lens")} className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"><Aperture /> Chụp qua tròng</Button>
                  <Button variant="ghost" onClick={loadSample} className="text-[#63dbc0] hover:bg-[#63dbc0]/10 hover:text-[#8ff0d9]"><FlaskConical /> Dùng dữ liệu mẫu</Button>
                </div>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2"><CaptureCard title="Ảnh hiệu chuẩn" subtitle="Không đặt tròng" image={referenceImage} /><CaptureCard title="Ảnh đo" subtitle="Tròng nằm đúng tâm" image={lensImage} /></div>
            </TabsContent>

            <TabsContent value="geometry">
              <div className="rounded-2xl border border-white/10 bg-[#0b1815] p-5">
                <h2 className="font-medium text-white">Thông số bộ gá thử nghiệm</h2><p className="mt-1 text-sm text-[#70857c]">Các giá trị này phải được đo thực tế và giữ cố định.</p>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <Field label="Camera → tròng" value="50" unit="mm" /><Field label="Tròng → lưới" value="300" unit="mm" /><Field label="Khoảng cách chấm" value="10" unit="mm" />
                  <label className="block"><span className="mb-2 block text-sm text-[#b7c7bf]">Hệ số hiệu chuẩn</span><div className="flex rounded-xl border border-white/10 bg-black/20 focus-within:border-[#63dbc0]/60"><input aria-label="Hệ số hiệu chuẩn" type="number" step="0.1" value={calibration} onChange={(event) => setCalibration(Number(event.target.value))} className="min-w-0 flex-1 bg-transparent px-3 py-3 text-white outline-none" /><span className="grid place-items-center border-l border-white/10 px-3 text-sm text-[#70857c]">D / Δtỷ lệ</span></div></label>
                </div>
                <div className="mt-5 rounded-xl border border-[#63dbc0]/15 bg-[#63dbc0]/6 p-4 text-sm leading-6 text-[#a9cfc5]">Hệ số phải được suy ra bằng bộ tròng chuẩn, ví dụ 0.00 D, ±1.00 D, ±2.00 D và tròng loạn có AXIS đã biết. Không dùng giá trị mặc định để kê đơn.</div>
              </div>
            </TabsContent>

            <TabsContent value="target">
              <div className="grid gap-4 rounded-2xl border border-white/10 bg-[#0b1815] p-5 md:grid-cols-[1fr_280px]">
                <div><h2 className="font-medium text-white">Lưới chấm chuẩn 10 mm</h2><p className="mt-2 max-w-xl text-sm leading-6 text-[#91a79d]">Hiển thị hoặc in lưới ở đúng tỷ lệ 100%. Ở bước tiếp theo, thuật toán thị giác máy tính sẽ tự nhận diện tâm từng chấm và tính ma trận biến dạng.</p><Button onClick={() => window.print()} className="mt-5 bg-[#bdfc6a] text-[#07110f] hover:bg-[#d0ff91]"><Printer /> In lưới chuẩn</Button></div>
                <DotGrid />
              </div>
            </TabsContent>
          </Tabs>
        </section>

        <aside className="space-y-4 lg:sticky lg:top-5 lg:h-fit">
          <div className="rounded-2xl border border-white/10 bg-[#0b1815] p-5">
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold tracking-[0.16em] text-[#63dbc0]">PHÂN TÍCH THỬ</p><h2 className="mt-1 text-lg font-semibold text-white">Hai kinh tuyến chính</h2></div><span className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-[#70857c]">minus cyl</span></div>
            <div className="mt-5 space-y-4"><NumberField label="Tỷ lệ kinh tuyến A" value={ratioA} step={0.001} onChange={setRatioA} /><NumberField label="Tỷ lệ kinh tuyến B" value={ratioB} step={0.001} onChange={setRatioB} /><NumberField label="Góc kinh tuyến A" value={principalAngle} step={1} suffix="°" onChange={setPrincipalAngle} /></div>
            <Button disabled={!referenceImage || !lensImage} onClick={() => setAnalyzed(true)} className="mt-5 w-full bg-[#63dbc0] text-[#07110f] hover:bg-[#8ff0d9]"><Aperture /> Tính SPH / CYL / AXIS</Button>
          </div>

          <div className={`rounded-2xl border p-5 transition-colors ${analyzed ? "border-[#bdfc6a]/30 bg-[#10251e]" : "border-white/10 bg-[#0b1815]"}`}>
            <div className="flex items-center justify-between"><p className="text-xs font-semibold tracking-[0.16em] text-[#91a79d]">KẾT QUẢ</p>{analyzed && <span className="rounded-full bg-[#bdfc6a]/12 px-2.5 py-1 text-xs text-[#bdfc6a]">Đã tính</span>}</div>
            <div className="mt-5 grid grid-cols-3 gap-2"><Result label="SPH" value={analyzed ? formatPower(measurement.sphere) : "—"} /><Result label="CYL" value={analyzed ? formatPower(measurement.cylinder) : "—"} /><Result label="AXIS" value={analyzed ? `${Math.round(measurement.axis)}°` : "—"} /></div>
            <div className="mt-5 border-t border-white/10 pt-4"><div className="mb-2 flex justify-between text-xs"><span className="text-[#70857c]">Chất lượng tín hiệu</span><span className="text-[#dbe9e2]">{analyzed ? `${Math.round(measurement.quality)}%` : "Chưa có"}</span></div><Progress value={analyzed ? measurement.quality : 0} className="h-1.5 bg-white/10 [&>div]:bg-[#bdfc6a]" /><p className="mt-3 text-xs leading-5 text-[#63786f]">Kết quả hiện dùng dữ liệu tỷ lệ đã nhập. Bước kế tiếp sẽ tự tìm chấm từ ảnh và kiểm chứng bằng lensmeter chuẩn.</p></div>
          </div>
        </aside>
      </div>

      <div className="print-target hidden print:grid"><DotGrid large /><p>OptiAxis calibration target · kiểm tra kích thước 100 mm trước khi sử dụng</p></div>
    </main>
  );
}

function CaptureCard({ title, subtitle, image }: { title: string; subtitle: string; image: string }) {
  return <div className="flex items-center gap-4 rounded-xl border border-white/10 bg-[#0b1815] p-3"><div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/10 bg-black/20">{image && image !== "sample-reference" && image !== "sample-lens" ? <img src={image} alt="Ảnh đã chụp" className="h-full w-full object-cover" /> : image ? <DotGrid compact /> : <Camera className="size-5 text-[#52655d]" />}</div><div className="min-w-0"><p className="text-sm font-medium text-white">{title}</p><p className="mt-1 text-xs text-[#70857c]">{image ? "Sẵn sàng phân tích" : subtitle}</p></div>{image && <Check className="ml-auto size-4 text-[#bdfc6a]" />}</div>;
}

function Field({ label, value, unit }: { label: string; value: string; unit: string }) {
  return <label className="block"><span className="mb-2 block text-sm text-[#b7c7bf]">{label}</span><div className="flex rounded-xl border border-white/10 bg-black/20"><input defaultValue={value} className="min-w-0 flex-1 bg-transparent px-3 py-3 text-white outline-none" /><span className="grid place-items-center border-l border-white/10 px-3 text-sm text-[#70857c]">{unit}</span></div></label>;
}

function NumberField({ label, value, step, suffix, onChange }: { label: string; value: number; step: number; suffix?: string; onChange: (value: number) => void }) {
  return <label className="block"><span className="mb-2 block text-sm text-[#b7c7bf]">{label}</span><div className="flex rounded-xl border border-white/10 bg-black/20 focus-within:border-[#63dbc0]/50"><input type="number" value={value} step={step} onChange={(event) => onChange(Number(event.target.value))} className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-white outline-none" />{suffix && <span className="grid place-items-center px-3 text-sm text-[#70857c]">{suffix}</span>}</div></label>;
}

function Result({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/8 bg-black/15 p-3 text-center"><p className="text-[11px] tracking-[0.12em] text-[#70857c]">{label}</p><p className="mt-2 whitespace-nowrap text-sm font-semibold text-white">{value}</p></div>;
}

function DotGrid({ compact = false, large = false }: { compact?: boolean; large?: boolean }) {
  return <div aria-label="Lưới chấm hiệu chuẩn" className={`${large ? "h-[180mm] w-[180mm]" : compact ? "size-full" : "aspect-square w-full"} dot-grid rounded-xl border border-white/10 bg-[#eff8f2]`} />;
}
