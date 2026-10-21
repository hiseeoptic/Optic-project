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
type GridMetrics = { points: number; spacingA: number; spacingB: number; angle: number; consistency: number };
type GridAnalysis = { ratioA: number; ratioB: number; angle: number; quality: number; referencePoints: number; lensPoints: number };

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
  const referenceDataRef = useRef<ImageData | null>(null);
  const lensDataRef = useRef<ImageData | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [referenceImage, setReferenceImage] = useState("");
  const [lensImage, setLensImage] = useState("");
  const [ratioA, setRatioA] = useState(0.96);
  const [ratioB, setRatioB] = useState(0.92);
  const [principalAngle, setPrincipalAngle] = useState(90);
  const [calibration, setCalibration] = useState(25);
  const [analyzed, setAnalyzed] = useState(false);
  const [analysisQuality, setAnalysisQuality] = useState(0);
  const [analysisMessage, setAnalysisMessage] = useState("Chụp đủ hai ảnh để tự động tìm lưới.");

  const measurement = useMemo(() => {
    const pA = quarter((ratioA - 1) * calibration);
    const pB = quarter((ratioB - 1) * calibration);
    const sphere = Math.max(pA, pB);
    const cylinder = Math.min(pA, pB) - sphere;
    const axis = pA >= pB ? principalAngle : (principalAngle + 90) % 180 || 180;
    const anisotropy = Math.abs(ratioA - ratioB);
    const quality = analysisQuality || Math.max(52, Math.min(94, 92 - anisotropy * 220));
    return { sphere, cylinder, axis, quality };
  }, [ratioA, ratioB, principalAngle, calibration, analysisQuality]);

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
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL("image/jpeg", 0.88);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    if (kind === "reference") {
      referenceDataRef.current = pixels;
      setReferenceImage(image);
      setAnalysisMessage("Đã khóa ảnh lưới nền. Giữ nguyên camera và đặt tròng vào tâm.");
    } else {
      lensDataRef.current = pixels;
      setLensImage(image);
      setAnalysisMessage("Đã chụp qua tròng. Sẵn sàng nhận diện chấm tự động.");
    }
    setAnalysisQuality(0);
    setAnalyzed(false);
  }

  function loadSample() {
    setReferenceImage("sample-reference");
    setLensImage("sample-lens");
    setRatioA(0.96);
    setRatioB(0.92);
    setPrincipalAngle(90);
    setCalibration(25);
    referenceDataRef.current = null;
    lensDataRef.current = null;
    setAnalysisQuality(88);
    setAnalysisMessage("Dữ liệu mẫu: 48 chấm nền và 47 chấm qua tròng đã được ghép.");
    setAnalyzed(false);
  }

  function analyzeMeasurement() {
    if (referenceImage === "sample-reference" && lensImage === "sample-lens") {
      setAnalyzed(true);
      return;
    }
    const reference = referenceDataRef.current;
    const lens = lensDataRef.current;
    if (!reference || !lens) return;
    try {
      const result = analyzeGridPair(reference, lens);
      setRatioA(result.ratioA);
      setRatioB(result.ratioB);
      setPrincipalAngle(result.angle);
      setAnalysisQuality(result.quality);
      setAnalysisMessage(`Đã ghép ${result.referencePoints} chấm nền với ${result.lensPoints} chấm qua tròng.`);
      setAnalyzed(true);
    } catch (error) {
      setAnalyzed(false);
      setAnalysisQuality(0);
      setAnalysisMessage(error instanceof Error ? error.message : "Không thể nhận diện lưới. Hãy chụp lại với ánh sáng đều.");
    }
  }

  function reset() {
    setReferenceImage("");
    setLensImage("");
    referenceDataRef.current = null;
    lensDataRef.current = null;
    setAnalysisQuality(0);
    setAnalysisMessage("Chụp đủ hai ảnh để tự động tìm lưới.");
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
            <Button disabled={!referenceImage || !lensImage} onClick={analyzeMeasurement} className="mt-5 w-full bg-[#63dbc0] text-[#07110f] hover:bg-[#8ff0d9]"><Aperture /> Tự nhận lưới & tính độ</Button>
            <p className="mt-3 text-xs leading-5 text-[#7f998e]">{analysisMessage}</p>
          </div>

          <div className={`rounded-2xl border p-5 transition-colors ${analyzed ? "border-[#bdfc6a]/30 bg-[#10251e]" : "border-white/10 bg-[#0b1815]"}`}>
            <div className="flex items-center justify-between"><p className="text-xs font-semibold tracking-[0.16em] text-[#91a79d]">KẾT QUẢ</p>{analyzed && <span className="rounded-full bg-[#bdfc6a]/12 px-2.5 py-1 text-xs text-[#bdfc6a]">Đã tính</span>}</div>
            <div className="mt-5 grid grid-cols-3 gap-2"><Result label="SPH" value={analyzed ? formatPower(measurement.sphere) : "—"} /><Result label="CYL" value={analyzed ? formatPower(measurement.cylinder) : "—"} /><Result label="AXIS" value={analyzed ? `${Math.round(measurement.axis)}°` : "—"} /></div>
            <div className="mt-5 border-t border-white/10 pt-4"><div className="mb-2 flex justify-between text-xs"><span className="text-[#70857c]">Chất lượng nhận diện</span><span className="text-[#dbe9e2]">{analyzed ? `${Math.round(measurement.quality)}%` : "Chưa có"}</span></div><Progress value={analyzed ? measurement.quality : 0} className="h-1.5 bg-white/10 [&>div]:bg-[#bdfc6a]" /><p className="mt-3 text-xs leading-5 text-[#63786f]">Thuật toán tìm tâm chấm và so sánh khoảng cách theo hai kinh tuyến. Chỉ dùng kết quả khi bộ gá đã hiệu chuẩn bằng tròng chuẩn và chất lượng đạt tối thiểu 80%.</p></div>
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

function analyzeGridPair(reference: ImageData, lens: ImageData): GridAnalysis {
  const referenceGrid = extractGridMetrics(reference);
  const lensGrid = extractGridMetrics(lens);
  if (referenceGrid.points < 16 || lensGrid.points < 16) {
    throw new Error(`Chưa thấy đủ chấm lưới (${referenceGrid.points}/${lensGrid.points}). Hãy tăng sáng, lấy nét và căn lưới phủ kín vòng tròn.`);
  }
  const ratioA = lensGrid.spacingA / referenceGrid.spacingA;
  const ratioB = lensGrid.spacingB / referenceGrid.spacingB;
  if (![ratioA, ratioB].every((value) => Number.isFinite(value) && value > 0.7 && value < 1.3)) {
    throw new Error("Hai ảnh bị lệch vị trí hoặc khoảng cách quá nhiều. Giữ camera và lưới cố định rồi chụp lại.");
  }
  const pointScore = Math.min(1, Math.min(referenceGrid.points, lensGrid.points) / 42);
  const consistency = Math.min(referenceGrid.consistency, lensGrid.consistency);
  const angleDelta = angularDistance(referenceGrid.angle, lensGrid.angle);
  const alignmentScore = Math.max(0, 1 - angleDelta / 12);
  const quality = Math.round(100 * (0.42 * pointScore + 0.38 * consistency + 0.2 * alignmentScore));
  return {
    ratioA: clamp(ratioA, 0.7, 1.3),
    ratioB: clamp(ratioB, 0.7, 1.3),
    angle: normalizeAxis(referenceGrid.angle),
    quality: clamp(quality, 0, 98),
    referencePoints: referenceGrid.points,
    lensPoints: lensGrid.points,
  };
}

function extractGridMetrics(image: ImageData): GridMetrics {
  const targetWidth = Math.min(420, image.width);
  const scale = targetWidth / image.width;
  const width = targetWidth;
  const height = Math.max(1, Math.round(image.height * scale));
  const gray = new Uint8Array(width * height);
  let sum = 0;
  let sumSq = 0;
  for (let y = 0; y < height; y++) {
    const sourceY = Math.min(image.height - 1, Math.floor(y / scale));
    for (let x = 0; x < width; x++) {
      const sourceX = Math.min(image.width - 1, Math.floor(x / scale));
      const index = (sourceY * image.width + sourceX) * 4;
      const value = Math.round(image.data[index] * 0.299 + image.data[index + 1] * 0.587 + image.data[index + 2] * 0.114);
      gray[y * width + x] = value;
      sum += value;
      sumSq += value * value;
    }
  }
  const mean = sum / gray.length;
  const deviation = Math.sqrt(Math.max(0, sumSq / gray.length - mean * mean));
  const threshold = mean - Math.max(18, deviation * 0.72);
  const binary = new Uint8Array(gray.length);
  const minX = Math.floor(width * 0.14);
  const maxX = Math.ceil(width * 0.86);
  const minY = Math.floor(height * 0.14);
  const maxY = Math.ceil(height * 0.86);
  for (let y = minY; y < maxY; y++) for (let x = minX; x < maxX; x++) {
    const index = y * width + x;
    if (gray[index] < threshold) binary[index] = 1;
  }

  const visited = new Uint8Array(binary.length);
  const queue = new Int32Array(binary.length);
  const points: Array<{ x: number; y: number }> = [];
  const minArea = Math.max(3, Math.round(width * height * 0.000018));
  const maxArea = Math.round(width * height * 0.0022);
  for (let y = minY; y < maxY; y++) for (let x = minX; x < maxX; x++) {
    const start = y * width + x;
    if (!binary[start] || visited[start]) continue;
    let head = 0;
    let tail = 0;
    let area = 0;
    let sumX = 0;
    let sumY = 0;
    let left = x;
    let right = x;
    let top = y;
    let bottom = y;
    queue[tail++] = start;
    visited[start] = 1;
    while (head < tail) {
      const current = queue[head++];
      const cx = current % width;
      const cy = Math.floor(current / width);
      area++; sumX += cx; sumY += cy;
      left = Math.min(left, cx); right = Math.max(right, cx); top = Math.min(top, cy); bottom = Math.max(bottom, cy);
      const neighbors = [current - 1, current + 1, current - width, current + width];
      for (const next of neighbors) {
        if (next < 0 || next >= binary.length || visited[next] || !binary[next]) continue;
        const nx = next % width;
        const ny = Math.floor(next / width);
        if (nx < minX || nx >= maxX || ny < minY || ny >= maxY) continue;
        visited[next] = 1;
        queue[tail++] = next;
      }
    }
    const componentWidth = right - left + 1;
    const componentHeight = bottom - top + 1;
    const aspect = componentWidth / Math.max(1, componentHeight);
    const fill = area / (componentWidth * componentHeight);
    if (area >= minArea && area <= maxArea && aspect > 0.45 && aspect < 2.2 && fill > 0.28) {
      points.push({ x: sumX / area, y: sumY / area });
    }
  }
  if (points.length < 8) return { points: points.length, spacingA: 0, spacingB: 0, angle: 0, consistency: 0 };

  const pairs: Array<{ distance: number; angle: number }> = [];
  for (let i = 0; i < points.length; i++) {
    const nearest: Array<{ distance: number; angle: number }> = [];
    for (let j = 0; j < points.length; j++) {
      if (i === j) continue;
      const dx = points[j].x - points[i].x;
      const dy = points[j].y - points[i].y;
      const distance = Math.hypot(dx, dy);
      if (distance > 4 && distance < Math.min(width, height) * 0.28) nearest.push({ distance, angle: Math.atan2(dy, dx) * 180 / Math.PI });
    }
    nearest.sort((a, b) => a.distance - b.distance);
    pairs.push(...nearest.slice(0, 4));
  }
  const baseDistance = median(pairs.map((pair) => pair.distance).slice().sort((a, b) => a - b).slice(0, Math.max(8, Math.floor(pairs.length * 0.65))));
  const closePairs = pairs.filter((pair) => Math.abs(pair.distance - baseDistance) < baseDistance * 0.3);
  let sin = 0;
  let cos = 0;
  for (const pair of closePairs) {
    const radians = pair.angle * Math.PI / 180 * 4;
    sin += Math.sin(radians);
    cos += Math.cos(radians);
  }
  const angle = normalizeAxis(Math.atan2(sin, cos) * 180 / Math.PI / 4);
  const spacingAValues = axisDistances(closePairs, angle);
  const spacingBValues = axisDistances(closePairs, angle + 90);
  const spacingA = median(spacingAValues);
  const spacingB = median(spacingBValues);
  const variation = (coefficientOfVariation(spacingAValues) + coefficientOfVariation(spacingBValues)) / 2;
  return { points: points.length, spacingA, spacingB, angle, consistency: clamp(1 - variation * 2.4, 0, 1) };
}

function axisDistances(pairs: Array<{ distance: number; angle: number }>, axis: number) {
  const values = pairs.filter((pair) => angularDistance(pair.angle, axis) < 18).map((pair) => pair.distance).sort((a, b) => a - b);
  return values.length ? values : pairs.map((pair) => pair.distance).sort((a, b) => a - b);
}

function coefficientOfVariation(values: number[]) {
  if (!values.length) return 1;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;
  return Math.sqrt(variance) / Math.max(average, 0.001);
}

function median(values: number[]) {
  if (!values.length) return 0;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}

function normalizeAxis(value: number) {
  const normalized = ((value % 180) + 180) % 180;
  return normalized === 0 ? 180 : normalized;
}

function angularDistance(a: number, b: number) {
  const delta = Math.abs((((a - b) % 180) + 180) % 180);
  return Math.min(delta, 180 - delta);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
