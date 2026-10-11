"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Check, CreditCard, Crosshair, Eye, RefreshCw, RotateCcw, ScanFace, Sparkles } from "lucide-react";
import { FaceLandmarker, FilesetResolver, type NormalizedLandmark } from "@mediapipe/tasks-vision";

import { Button } from "@/components/ui/button";

type TrackingState = "idle" | "loading" | "searching" | "tracking" | "error";
type FacingMode = "user" | "environment";
type Point = { x: number; y: number };
type ScaleMethod = "iris" | "card" | "none";
type DistanceState = "unknown" | "too-far" | "good" | "too-close";
type Reading = { pd: number; leftPd: number; rightPd: number; faceWidth: number; confidence: number; roll: number; yaw: number; irisSymmetry: number; stableFrames: number; isStable: boolean; scaleMethod: ScaleMethod; distanceState: DistanceState; faceDetected: boolean };

const EMPTY_READING: Reading = { pd: 0, leftPd: 0, rightPd: 0, faceWidth: 0, confidence: 0, roll: 0, yaw: 0, irisSymmetry: 0, stableFrames: 0, isStable: false, scaleMethod: "none", distanceState: "unknown", faceDetected: false };
const CARD_WIDTH_MM = 85.6;
const IRIS_DIAMETER_MM = 11.7;
const IRIS_SCALE_FACTOR = 1.102;
const MIN_STABLE_FRAMES = 8;
const MAX_SAMPLE_FRAMES = 30;

export function PdFaceScanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const animationRef = useRef(0);
  const loopRef = useRef<() => void>(() => undefined);
  const lastVideoTimeRef = useRef(-1);
  const facingModeRef = useRef<FacingMode>("user");
  const smoothRef = useRef<Reading>(EMPTY_READING);
  const sampleRef = useRef<number[]>([]);
  const pdPixelsRef = useRef(0);
  const [tracking, setTracking] = useState<TrackingState>("idle");
  const [facingMode, setFacingMode] = useState<FacingMode>("user");
  const [reading, setReading] = useState<Reading>(EMPTY_READING);
  const [captured, setCaptured] = useState<Reading | null>(null);
  const [manualScale, setManualScale] = useState<number | null>(null);
  const [calibrating, setCalibrating] = useState(false);
  const [calibrationPoints, setCalibrationPoints] = useState<Point[]>([]);
  const [calibrationError, setCalibrationError] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(animationRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    landmarkerRef.current?.close();
    landmarkerRef.current = null;
    lastVideoTimeRef.current = -1;
    clearCanvas();
    setTracking("idle");
  }, [clearCanvas]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const analyze = useCallback((landmarks: NormalizedLandmark[]) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || landmarks.length < 478) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(rect.width * ratio);
    const pixelHeight = Math.round(rect.height * ratio);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) { canvas.width = pixelWidth; canvas.height = pixelHeight; }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const scale = Math.max(rect.width / video.videoWidth, rect.height / video.videoHeight);
    const shownWidth = video.videoWidth * scale;
    const shownHeight = video.videoHeight * scale;
    const offsetX = (rect.width - shownWidth) / 2;
    const offsetY = (rect.height - shownHeight) / 2;
    const mirrored = facingModeRef.current === "user";
    const point = (index: number): Point => {
      const rawX = offsetX + landmarks[index].x * shownWidth;
      return { x: mirrored ? rect.width - rawX : rawX, y: offsetY + landmarks[index].y * shownHeight };
    };
    const mean = (indices: number[]): Point => {
      const points = indices.map(point);
      return { x: points.reduce((sum, item) => sum + item.x, 0) / points.length, y: points.reduce((sum, item) => sum + item.y, 0) / points.length };
    };
    const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
    const maxDiameter = (indices: number[]) => {
      const points = indices.map(point);
      let result = 0;
      for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) result = Math.max(result, distance(points[i], points[j]));
      return result;
    };

    const pupilA = mean([468, 469, 470, 471, 472]);
    const pupilB = mean([473, 474, 475, 476, 477]);
    const left = pupilA.x < pupilB.x ? pupilA : pupilB;
    const right = pupilA.x < pupilB.x ? pupilB : pupilA;
    const irisOne = maxDiameter([469, 470, 471, 472]);
    const irisTwo = maxDiameter([474, 475, 476, 477]);
    const irisPx = (irisOne + irisTwo) / 2;
    if (irisPx < 2) return;
    const nose = point(168);
    const templeA = point(127);
    const templeB = point(356);
    const templeLeft = templeA.x < templeB.x ? templeA : templeB;
    const templeRight = templeA.x < templeB.x ? templeB : templeA;
    const pdPx = distance(left, right);
    pdPixelsRef.current = pdPx;
    const roll = Math.abs(Math.atan2(right.y - left.y, right.x - left.x) * 180 / Math.PI);
    const axisX = (right.x - left.x) / Math.max(pdPx, 1);
    const axisY = (right.y - left.y) / Math.max(pdPx, 1);
    const noseProjection = (nose.x - left.x) * axisX + (nose.y - left.y) * axisY;
    const leftNosePx = Math.max(0, Math.min(pdPx, noseProjection));
    const rightNosePx = pdPx - leftNosePx;
    const yaw = Math.abs(leftNosePx - rightNosePx) / Math.max(pdPx, 1);
    const irisSymmetry = Math.min(irisOne, irisTwo) / Math.max(irisOne, irisTwo);
    const faceFill = distance(templeLeft, templeRight) / Math.max(rect.width, 1);
    const distanceState: DistanceState = faceFill < 0.26 ? "too-far" : faceFill > 0.56 ? "too-close" : "good";
    const irisScale = IRIS_DIAMETER_MM / irisPx * IRIS_SCALE_FACTOR;
    const activeScale = manualScale ?? irisScale;
    const scaleMethod: ScaleMethod = manualScale ? "card" : "iris";
    const rawPd = pdPx * activeScale;
    const rawFaceWidth = distance(templeLeft, templeRight) * activeScale;
    const poseReady = roll <= 3 && yaw <= 0.1 && irisSymmetry >= 0.91 && irisPx >= 8 && distanceState === "good";
    const plausible = rawPd >= 45 && rawPd <= 80 && rawFaceWidth >= 95 && rawFaceWidth <= 190;
    if (poseReady && plausible) {
      sampleRef.current.push(rawPd);
      if (sampleRef.current.length > MAX_SAMPLE_FRAMES) sampleRef.current.shift();
    } else if (sampleRef.current.length) sampleRef.current.shift();
    const recent = sampleRef.current.slice(-20);
    const robustPd = median(removeOutliers(recent));
    const spread = coefficientOfVariation(recent);
    const isStable = recent.length >= MIN_STABLE_FRAMES && spread <= 0.025;
    const stableRatio = Math.min(1, recent.length / MIN_STABLE_FRAMES);
    const rawConfidence = Math.max(0, Math.min(100, 100 - roll * 5.5 - yaw * 150 - Math.max(0, 8 - irisPx) * 6 - (1 - irisSymmetry) * 100 - (distanceState === "good" ? 0 : 25) - Math.min(25, spread * 500)));
    const confidence = Math.round(plausible ? Math.min(rawConfidence * (0.72 + stableRatio * 0.28), manualScale ? 98 : 86) : 0);
    const pdForDisplay = isStable && robustPd ? robustPd : rawPd;
    const pdAdjustment = rawPd > 0 ? pdForDisplay / rawPd : 1;
    const next: Reading = { pd: plausible ? pdForDisplay : 0, leftPd: plausible ? leftNosePx * activeScale * pdAdjustment : 0, rightPd: plausible ? rightNosePx * activeScale * pdAdjustment : 0, faceWidth: plausible ? rawFaceWidth : 0, confidence, roll, yaw, irisSymmetry, stableFrames: recent.length, isStable, scaleMethod, distanceState, faceDetected: true };
    const previous = smoothRef.current;
    const alpha = previous.pd && next.pd ? 0.18 : 1;
    const smooth = { pd: lerp(previous.pd, next.pd, alpha), leftPd: lerp(previous.leftPd, next.leftPd, alpha), rightPd: lerp(previous.rightPd, next.rightPd, alpha), faceWidth: lerp(previous.faceWidth, next.faceWidth, alpha), confidence: lerp(previous.confidence, next.confidence, 0.25), roll: lerp(previous.roll, next.roll, 0.25), yaw: lerp(previous.yaw, next.yaw, 0.25), irisSymmetry: next.irisSymmetry, stableFrames: next.stableFrames, isStable: next.isStable, scaleMethod: next.scaleMethod, distanceState: next.distanceState, faceDetected: true };
    smoothRef.current = smooth;
    setReading(smooth);
    drawMeasurement(ctx, left, right, nose, templeLeft, templeRight, smooth, rect.width);
    drawCalibration(ctx, calibrationPoints, calibrating);
  }, [calibrating, calibrationPoints, manualScale]);

  const runTracking = useCallback(() => {
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;
    if (!video || !landmarker || !streamRef.current) return;
    if (video.readyState >= 2 && video.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime;
      const face = landmarker.detectForVideo(video, performance.now()).faceLandmarks[0];
      if (face) { analyze(face); setTracking("tracking"); } else { clearCanvas(); setTracking("searching"); }
    }
    animationRef.current = requestAnimationFrame(() => loopRef.current());
  }, [analyze, clearCanvas]);

  useEffect(() => { loopRef.current = runTracking; }, [runTracking]);

  const startCamera = useCallback(async (mode: FacingMode = facingMode) => {
    stopCamera();
    setErrorMessage("");
    setCaptured(null);
    setManualScale(null);
    setCalibrationPoints([]);
    setCalibrating(false);
    setCalibrationError("");
    sampleRef.current = [];
    pdPixelsRef.current = 0;
    smoothRef.current = EMPTY_READING;
    setReading(EMPTY_READING);
    setTracking("loading");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Trình duyệt này chưa hỗ trợ camera web.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 960 } } });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("Không thể khởi tạo khung camera.");
      video.srcObject = stream;
      await video.play();
      const vision = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
      const options = { baseOptions: { modelAssetPath: "/mediapipe/face_landmarker.task", delegate: "GPU" as const }, runningMode: "VIDEO" as const, numFaces: 1, minFaceDetectionConfidence: 0.65, minFacePresenceConfidence: 0.65, minTrackingConfidence: 0.65 };
      try { landmarkerRef.current = await FaceLandmarker.createFromOptions(vision, options); }
      catch { landmarkerRef.current = await FaceLandmarker.createFromOptions(vision, { ...options, baseOptions: { ...options.baseOptions, delegate: "CPU" as const } }); }
      facingModeRef.current = mode;
      setFacingMode(mode);
      lastVideoTimeRef.current = -1;
      setTracking("searching");
      animationRef.current = requestAnimationFrame(() => loopRef.current());
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setErrorMessage(error instanceof DOMException && error.name === "NotAllowedError" ? "Camera chưa được cho phép. Hãy bật quyền camera rồi thử lại." : error instanceof Error ? error.message : "Không thể mở camera.");
      setTracking("error");
    }
  }, [facingMode, stopCamera]);

  async function flipCamera() {
    const next = facingMode === "user" ? "environment" : "user";
    facingModeRef.current = next;
    setFacingMode(next);
    await startCamera(next);
  }

  function handleCalibrationClick(event: React.MouseEvent<HTMLCanvasElement>) {
    if (!calibrating) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const next = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    if (!calibrationPoints.length) {
      setCalibrationPoints([next]);
      const ctx = event.currentTarget.getContext("2d");
      if (ctx) drawCalibration(ctx, [next], true);
      return;
    }
    const pixels = Math.hypot(next.x - calibrationPoints[0].x, next.y - calibrationPoints[0].y);
    const angle = Math.abs(Math.atan2(next.y - calibrationPoints[0].y, next.x - calibrationPoints[0].x) * 180 / Math.PI);
    const horizontalAngle = Math.min(angle, Math.abs(180 - angle));
    const candidateScale = CARD_WIDTH_MM / Math.max(pixels, 1);
    const candidatePd = pdPixelsRef.current * candidateScale;
    if (pixels < rect.width * 0.22 || horizontalAngle > 10 || candidatePd < 45 || candidatePd > 80) {
      setCalibrationPoints([calibrationPoints[0]]);
      setCalibrationError(horizontalAngle > 10 ? "Hai mép thẻ phải nằm gần như cùng một đường ngang. Hãy chạm lại." : "Khoảng đánh dấu không hợp lệ và có thể tạo sai số lớn. Hãy giữ thẻ sát trán rồi chạm đúng hai mép ngoài.");
      return;
    }
    setCalibrationPoints([calibrationPoints[0], next]);
    const ctx = event.currentTarget.getContext("2d");
    if (ctx) drawCalibration(ctx, [calibrationPoints[0], next], false);
    setManualScale(candidateScale);
    setCalibrating(false);
    setCalibrationError("");
    setCaptured(null);
    smoothRef.current = EMPTY_READING;
    sampleRef.current = [];
    void videoRef.current?.play();
  }

  function beginCardCalibration() {
    setCalibrationPoints([]);
    setManualScale(null);
    setCaptured(null);
    setCalibrationError("");
    setCalibrating(true);
    videoRef.current?.pause();
  }

  function cancelCardCalibration() {
    setCalibrationPoints([]);
    setCalibrating(false);
    setCalibrationError("");
    void videoRef.current?.play();
  }

  const isActive = tracking === "loading" || tracking === "searching" || tracking === "tracking";
  const display = captured ?? reading;
  const measurementReady = tracking === "tracking" && reading.isStable && reading.confidence >= 72 && Boolean(reading.pd);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="space-y-4">
        <div className="relative h-[590px] overflow-hidden rounded-3xl border border-white/10 bg-[#081310] shadow-[0_30px_90px_rgba(0,0,0,.35)] sm:aspect-[4/3] sm:h-auto sm:min-h-[520px]">
          <video ref={videoRef} playsInline muted className={`absolute inset-0 size-full object-cover ${facingMode === "user" ? "-scale-x-100" : ""}`} />
          <canvas ref={canvasRef} onClick={handleCalibrationClick} className={`absolute inset-0 size-full ${calibrating ? "z-20 cursor-crosshair" : "pointer-events-none"}`} aria-label="Đường đo tâm mống mắt và bề rộng khuôn mặt" />
          {!isActive && <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_center,rgba(99,219,192,.12),transparent_58%)]"><div className="max-w-sm px-6 text-center"><div className="mx-auto grid size-24 place-items-center rounded-full border border-dashed border-[#63dbc0]/35 bg-[#63dbc0]/7"><Crosshair className="size-11 text-[#63dbc0]" /></div><p className="mt-5 text-lg font-medium text-white">Quét tâm đồng tử trực tiếp</p><p className="mt-2 text-sm leading-6 text-[#7f958b]">Nhìn thẳng vào camera, tháo kính và giữ ánh sáng đều hai bên mắt.</p></div></div>}
          {isActive && tracking !== "tracking" && <div className="pointer-events-none absolute inset-0 grid place-items-center"><div className="h-[72%] w-[52%] rounded-[48%] border-2 border-dashed border-[#bdfc6a]/50" /></div>}
          {isActive && <div className="pointer-events-none absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/80 bg-white px-3 py-1.5 text-[10px] font-semibold text-[#07110f] shadow-[0_0_30px_rgba(255,255,255,.8)]"><span className="size-2.5 animate-pulse rounded-full bg-white ring-2 ring-[#07110f]" /> Nhìn vào chấm · giữ đầu thẳng</div>}
          {calibrating && <div className="pointer-events-none absolute inset-x-4 top-16 z-30 mx-auto max-w-lg rounded-2xl border border-white/20 bg-[#07110f]/92 p-3 text-center text-sm text-white shadow-2xl backdrop-blur-xl">Khung hình đã được đóng băng · {calibrationPoints.length ? "Chạm mép ngoài thứ hai của thẻ" : "Chạm mép ngoài thứ nhất của thẻ"}</div>}
          <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full border border-white/10 bg-[#07110f]/82 px-3 py-2 text-xs backdrop-blur-xl"><span className={`size-2 rounded-full ${tracking === "tracking" ? "bg-[#bdfc6a]" : tracking === "error" ? "bg-rose-400" : "bg-amber-300"}`} /><span>{trackingLabel(tracking)}</span>{tracking === "tracking" && <span className="text-[#71877d]">· {Math.round(reading.confidence)}%</span>}</div>
          {captured && <div className="absolute right-4 top-4 rounded-full border border-[#bdfc6a]/20 bg-[#bdfc6a]/12 px-3 py-2 text-xs text-[#d7ff9f] backdrop-blur-xl"><Check className="mr-1 inline size-3.5" /> Đã giữ kết quả</div>}
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-white/10 bg-[#07110f]/86 p-2 backdrop-blur-xl">
            {!isActive ? <Button onClick={() => startCamera()} className="bg-[#bdfc6a] text-[#07110f] hover:bg-[#d0ff91]"><Camera /> Mở camera</Button> : <><Button onClick={flipCamera} disabled={tracking === "loading" || calibrating} variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"><RefreshCw /> Đổi camera</Button><Button onClick={() => setCaptured(measurementReady ? reading : null)} disabled={!measurementReady || calibrating} className="bg-[#bdfc6a] text-[#07110f] hover:bg-[#d0ff91]"><Crosshair /> Giữ kết quả</Button><Button onClick={stopCamera} variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"><CameraOff /> Tắt</Button></>}
          </div>
        </div>
        {errorMessage && <div className="rounded-2xl border border-rose-400/20 bg-rose-400/8 p-4 text-sm text-rose-200">{errorMessage}</div>}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><StatusCard icon={<Eye />} label="Khoảng cách" value={distanceLabel(reading.distanceState)} ready={reading.distanceState === "good"} /><StatusCard icon={<ScanFace />} label="Tư thế" value={poseLabel(reading)} ready={reading.faceDetected && reading.roll <= 3 && reading.yaw <= 0.1} /><StatusCard icon={<Sparkles />} label="Ổn định" value={reading.isStable ? "Đã khóa nhiều khung hình" : `${Math.min(reading.stableFrames, MIN_STABLE_FRAMES)}/${MIN_STABLE_FRAMES} khung đạt`} ready={reading.isStable} /><StatusCard icon={<CreditCard />} label="Tỷ lệ milimét" value={manualScale ? "Thẻ 85,60 mm · chuẩn" : "Mống mắt · đo nhanh"} ready={reading.scaleMethod !== "none"} /></div>
      </section>

      <aside className="space-y-4">
        <section className="rounded-3xl border border-white/10 bg-[#0b1815] p-5"><div className="flex items-center justify-between"><p className="text-xs font-semibold tracking-[.16em] text-[#63dbc0]">ĐO LAI · KẾT QUẢ</p><span className={`rounded-full px-2 py-1 text-[10px] ${display.pd ? "bg-[#bdfc6a]/10 text-[#cfff91]" : "bg-amber-300/10 text-amber-200"}`}>{display.pd ? display.scaleMethod === "card" ? "Đo chuẩn · thẻ 85,60 mm" : "Đo nhanh · mống mắt" : "Chưa có số đo hợp lệ"}</span></div><div className="mt-5 rounded-2xl border border-[#bdfc6a]/15 bg-[#bdfc6a]/6 p-5"><p className="text-sm text-[#91a79d]">Khoảng cách đồng tử</p><p className="mt-2 text-5xl font-semibold tracking-[-.05em] text-white">{format(display.pd)}<span className="ml-2 text-lg text-[#91a79d]">mm</span></p><div className="mt-4 grid grid-cols-2 gap-2"><SmallMetric label="PD trái" value={format(display.leftPd)} /><SmallMetric label="PD phải" value={format(display.rightPd)} /></div>{display.scaleMethod === "iris" && <p className="mt-4 text-xs leading-5 text-amber-100/65">Đây là số đo nhanh theo đường kính mống mắt. Hiệu chuẩn thẻ bên dưới để có tỷ lệ cá nhân chính xác hơn.</p>}{!display.pd && <p className="mt-4 text-xs leading-5 text-amber-100/65">Đưa mặt vào khung, giữ đầu thẳng và chờ đủ 8 khung hình ổn định. Không cần tìm điểm lóe sáng.</p>}</div><div className="mt-3 rounded-2xl border border-white/8 bg-black/15 p-4"><p className="text-sm text-[#91a79d]">Rộng mặt tại cao độ vành tai</p><p className="mt-1 text-3xl font-semibold text-white">{format(display.faceWidth)} <span className="text-base font-normal text-[#71877d]">mm</span></p><p className="mt-2 text-xs leading-5 text-[#63786f]">Ước lượng qua hai điểm thái dương gần vành tai; camera chính diện không nhìn được mép ngoài của tai.</p></div>{captured && <Button onClick={() => setCaptured(null)} variant="outline" className="mt-3 w-full border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"><RotateCcw /> Đo lại</Button>}</section>
        <section className="rounded-2xl border border-white/10 bg-[#0b1815] p-4"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#63dbc0]/10 text-[#63dbc0]"><CreditCard className="size-5" /></span><div><p className="text-sm font-medium text-white">Nâng lên đo chuẩn bằng thẻ</p><p className="mt-1 text-xs leading-5 text-[#70857c]">Giữ thẻ ngân hàng 85,60 mm nằm ngang sát trán, đóng băng hình rồi chạm đúng hai mép ngoài.</p></div></div><Button onClick={calibrating ? cancelCardCalibration : beginCardCalibration} disabled={!calibrating && (!isActive || tracking !== "tracking")} variant="outline" className="mt-4 w-full border-[#63dbc0]/20 bg-[#63dbc0]/7 text-[#a9e4d6] hover:bg-[#63dbc0]/12 hover:text-white"><Crosshair /> {calibrating ? "Hủy hiệu chuẩn" : manualScale ? "Hiệu chuẩn lại" : "Đóng băng & hiệu chuẩn"}</Button>{calibrationError && <p className="mt-3 rounded-xl border border-rose-400/15 bg-rose-400/7 p-3 text-xs leading-5 text-rose-200">{calibrationError}</p>}{manualScale && <div className="mt-3 flex items-center justify-between rounded-xl bg-[#bdfc6a]/7 px-3 py-2 text-xs"><span className="text-[#91a79d]">Tỷ lệ thẻ đã khóa</span><span className="font-medium text-[#cfff91]">{manualScale.toFixed(4)} mm/px</span></div>}</section>
        <section className="rounded-2xl border border-amber-300/12 bg-amber-300/5 p-4 text-xs leading-5 text-amber-100/70">Kết quả từ webcam là ước lượng phục vụ chọn gọng. Đơn kính, lắp tròng hoặc quyết định lâm sàng cần được đo lại bằng pupillometer tại cơ sở nhãn khoa.</section>
      </aside>
    </div>
  );
}

function drawMeasurement(ctx: CanvasRenderingContext2D, left: Point, right: Point, nose: Point, templeLeft: Point, templeRight: Point, reading: Reading, width: number) {
  const good = reading.confidence >= 70;
  ctx.save(); ctx.lineCap = "round"; ctx.shadowBlur = 12; ctx.shadowColor = good ? "rgba(189,252,106,.5)" : "rgba(251,191,36,.45)"; ctx.strokeStyle = good ? "#bdfc6a" : "#fbbf24"; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(left.x, left.y); ctx.lineTo(right.x, right.y); ctx.stroke();
  [left, right].forEach((pupil) => { ctx.beginPath(); ctx.arc(pupil.x, pupil.y, 6, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(pupil.x, pupil.y, 13, 0, Math.PI * 2); ctx.stroke(); });
  ctx.beginPath(); ctx.moveTo(nose.x, nose.y - 8); ctx.lineTo(nose.x, nose.y + 8); ctx.stroke();
  label(ctx, reading.pd ? `${reading.pd.toFixed(1)} mm · ${reading.scaleMethod === "card" ? "ĐO CHUẨN" : "ĐO NHANH"}` : "Đưa mặt vào đúng khung", (left.x + right.x) / 2, Math.min(left.y, right.y) - 28, width);
  ctx.shadowColor = "rgba(99,219,192,.5)"; ctx.strokeStyle = "#63dbc0"; ctx.fillStyle = "#63dbc0"; ctx.setLineDash([6, 5]);
  ctx.beginPath(); ctx.moveTo(templeLeft.x, templeLeft.y); ctx.lineTo(templeRight.x, templeRight.y); ctx.stroke(); ctx.setLineDash([]);
  [templeLeft, templeRight].forEach((temple) => { ctx.beginPath(); ctx.arc(temple.x, temple.y, 5, 0, Math.PI * 2); ctx.fill(); });
  label(ctx, `Rộng mặt ≈ ${reading.faceWidth.toFixed(1)} mm`, (templeLeft.x + templeRight.x) / 2, Math.max(templeLeft.y, templeRight.y) + 25, width, "#63dbc0"); ctx.restore();
}

function drawCalibration(ctx: CanvasRenderingContext2D, points: Point[], calibrating: boolean) {
  if (!calibrating && points.length < 2) return;
  ctx.save(); ctx.strokeStyle = "#ffffff"; ctx.fillStyle = "#ffffff"; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
  if (points.length === 2) { ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y); ctx.lineTo(points[1].x, points[1].y); ctx.stroke(); }
  points.forEach((point) => { ctx.setLineDash([]); ctx.beginPath(); ctx.arc(point.x, point.y, 8, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(point.x, point.y, 2, 0, Math.PI * 2); ctx.fill(); });
  ctx.restore();
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, color = "#bdfc6a") {
  ctx.font = "600 13px Avenir Next, Segoe UI, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const boxWidth = ctx.measureText(text).width + 22; const centerX = Math.max(boxWidth / 2 + 8, Math.min(width - boxWidth / 2 - 8, x));
  ctx.fillStyle = "rgba(7,17,15,.86)"; ctx.beginPath(); ctx.roundRect(centerX - boxWidth / 2, y - 14, boxWidth, 28, 14); ctx.fill(); ctx.fillStyle = color; ctx.fillText(text, centerX, y + 1);
}

function lerp(from: number, to: number, amount: number) { return from + (to - from) * amount; }
function median(values: number[]) { if (!values.length) return 0; const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; }
function removeOutliers(values: number[]) { if (values.length < 5) return values; const center = median(values); const deviations = values.map((value) => Math.abs(value - center)); const mad = median(deviations) || 0.1; return values.filter((value) => Math.abs(value - center) / mad < 3.5); }
function coefficientOfVariation(values: number[]) { if (values.length < 2) return 1; const mean = values.reduce((sum, value) => sum + value, 0) / values.length; const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1); return mean ? Math.sqrt(variance) / mean : 1; }
function format(value: number) { return value > 0 ? value.toFixed(1) : "—"; }
function trackingLabel(state: TrackingState) { if (state === "loading") return "Đang tải AI mắt"; if (state === "searching") return "Đang tìm khuôn mặt"; if (state === "tracking") return "Đang đo trực tiếp"; if (state === "error") return "Camera chưa sẵn sàng"; return "Camera đang tắt"; }
function poseLabel(reading: Reading) { if (!reading.faceDetected) return "Chờ khuôn mặt"; if (reading.roll > 3) return "Giữ đầu ngang"; if (reading.yaw > 0.1) return "Nhìn thẳng hơn"; if (reading.irisSymmetry < 0.91) return "Mở đều hai mắt"; return "Đạt chuẩn đo"; }
function distanceLabel(state: DistanceState) { if (state === "too-far") return "Đưa mặt lại gần"; if (state === "too-close") return "Lùi mặt ra xa"; if (state === "good") return "Khoảng cách phù hợp"; return "Chờ khuôn mặt"; }
function SmallMetric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-black/15 p-3"><span className="block text-xs text-[#70857c]">{label}</span><span className="mt-1 block text-lg font-medium text-white">{value} mm</span></div>; }
function StatusCard({ icon, label, value, ready }: { icon: React.ReactNode; label: string; value: string; ready?: boolean }) { return <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0b1815] p-4"><span className={`grid size-9 shrink-0 place-items-center rounded-lg ${ready ? "bg-[#bdfc6a]/10 text-[#bdfc6a]" : "bg-white/5 text-[#70857c]"}`}>{icon}</span><span><span className="block text-xs text-[#70857c]">{label}</span><span className="mt-1 block text-sm text-white">{value}</span></span></div>; }
