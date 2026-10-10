"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Check, CreditCard, Crosshair, RefreshCw, RotateCcw, ScanFace, Sparkles } from "lucide-react";
import { FaceLandmarker, FilesetResolver, type NormalizedLandmark } from "@mediapipe/tasks-vision";

import { Button } from "@/components/ui/button";

type TrackingState = "idle" | "loading" | "searching" | "tracking" | "error";
type FacingMode = "user" | "environment";
type Point = { x: number; y: number };
type Reading = { pd: number; leftPd: number; rightPd: number; faceWidth: number; confidence: number; roll: number; yaw: number; reflection: number; usesGlint: boolean };
type Glint = { point: Point; quality: number } | null;

const EMPTY_READING: Reading = { pd: 0, leftPd: 0, rightPd: 0, faceWidth: 0, confidence: 0, roll: 0, yaw: 0, reflection: 0, usesGlint: false };
const CARD_WIDTH_MM = 85.6;

export function PdFaceScanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const eyeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const animationRef = useRef(0);
  const loopRef = useRef<() => void>(() => undefined);
  const lastVideoTimeRef = useRef(-1);
  const facingModeRef = useRef<FacingMode>("user");
  const smoothRef = useRef<Reading>(EMPTY_READING);
  const glintStreakRef = useRef(0);
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
    const videoToDisplay = (videoPoint: Point): Point => {
      const rawX = offsetX + videoPoint.x * scale;
      return { x: mirrored ? rect.width - rawX : rawX, y: offsetY + videoPoint.y * scale };
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
    if (!eyeCanvasRef.current) eyeCanvasRef.current = document.createElement("canvas");
    const rawGlintA = findCornealReflection(video, eyeCanvasRef.current, landmarks, 468, [469, 470, 471, 472]);
    const rawGlintB = findCornealReflection(video, eyeCanvasRef.current, landmarks, 473, [474, 475, 476, 477]);
    const glintA = rawGlintA ? { ...rawGlintA, point: videoToDisplay(rawGlintA.point) } : null;
    const glintB = rawGlintB ? { ...rawGlintB, point: videoToDisplay(rawGlintB.point) } : null;
    const leftGlint = pupilA.x < pupilB.x ? glintA : glintB;
    const rightGlint = pupilA.x < pupilB.x ? glintB : glintA;
    const irisOne = maxDiameter([469, 470, 471, 472]);
    const irisTwo = maxDiameter([474, 475, 476, 477]);
    const irisPx = (irisOne + irisTwo) / 2;
    if (irisPx < 2) return;
    const offsetSimilarity = leftGlint && rightGlint
      ? Math.hypot((leftGlint.point.x - left.x) / irisOne - (rightGlint.point.x - right.x) / irisTwo, (leftGlint.point.y - left.y) / irisOne - (rightGlint.point.y - right.y) / irisTwo)
      : Number.POSITIVE_INFINITY;
    const glintCandidate = Boolean(leftGlint && rightGlint && leftGlint.quality >= 0.55 && rightGlint.quality >= 0.55 && offsetSimilarity < 0.55);
    glintStreakRef.current = glintCandidate ? Math.min(20, glintStreakRef.current + 1) : Math.max(0, glintStreakRef.current - 2);
    const usesGlint = glintCandidate && glintStreakRef.current >= 10;
    const leftMarker = usesGlint ? leftGlint!.point : left;
    const rightMarker = usesGlint ? rightGlint!.point : right;
    const nose = point(168);
    const templeA = point(127);
    const templeB = point(356);
    const templeLeft = templeA.x < templeB.x ? templeA : templeB;
    const templeRight = templeA.x < templeB.x ? templeB : templeA;
    const pdPx = distance(leftMarker, rightMarker);
    if (glintCandidate) pdPixelsRef.current = distance(leftGlint!.point, rightGlint!.point);
    else if (!pdPixelsRef.current) pdPixelsRef.current = distance(left, right);
    const roll = Math.abs(Math.atan2(right.y - left.y, right.x - left.x) * 180 / Math.PI);
    const axisX = (rightMarker.x - leftMarker.x) / Math.max(pdPx, 1);
    const axisY = (rightMarker.y - leftMarker.y) / Math.max(pdPx, 1);
    const noseProjection = (nose.x - leftMarker.x) * axisX + (nose.y - leftMarker.y) * axisY;
    const leftNosePx = Math.max(0, Math.min(pdPx, noseProjection));
    const rightNosePx = pdPx - leftNosePx;
    const yaw = Math.abs(leftNosePx - rightNosePx) / Math.max(pdPx, 1);
    const irisSymmetry = Math.min(irisOne, irisTwo) / Math.max(irisOne, irisTwo);
    const reflection = ((leftGlint?.quality ?? 0) + (rightGlint?.quality ?? 0)) * 50;
    const rawConfidence = Math.max(0, Math.min(100, 100 - roll * 5.5 - yaw * 160 - Math.max(0, 8 - irisPx) * 5 - (1 - irisSymmetry) * 45));
    const measuredPd = manualScale ? pdPx * manualScale : 0;
    const measuredFaceWidth = manualScale ? distance(templeLeft, templeRight) * manualScale : 0;
    const plausible = Boolean(manualScale && measuredPd >= 45 && measuredPd <= 80 && measuredFaceWidth >= 95 && measuredFaceWidth <= 190);
    const confidence = Math.round(plausible ? Math.min(rawConfidence, usesGlint ? 100 : 45) : 0);
    const next: Reading = { pd: plausible ? measuredPd : 0, leftPd: plausible ? leftNosePx * manualScale! : 0, rightPd: plausible ? rightNosePx * manualScale! : 0, faceWidth: plausible ? measuredFaceWidth : 0, confidence, roll, yaw, reflection, usesGlint };
    const previous = smoothRef.current;
    const alpha = previous.pd && next.pd ? 0.18 : 1;
    const smooth = { pd: lerp(previous.pd, next.pd, alpha), leftPd: lerp(previous.leftPd, next.leftPd, alpha), rightPd: lerp(previous.rightPd, next.rightPd, alpha), faceWidth: lerp(previous.faceWidth, next.faceWidth, alpha), confidence: lerp(previous.confidence, next.confidence, 0.25), roll: lerp(previous.roll, next.roll, 0.25), yaw: lerp(previous.yaw, next.yaw, 0.25), reflection: lerp(previous.reflection, next.reflection, 0.25), usesGlint };
    smoothRef.current = smooth;
    setReading(smooth);
    drawMeasurement(ctx, leftMarker, rightMarker, nose, templeLeft, templeRight, smooth, rect.width);
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
    glintStreakRef.current = 0;
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
  const measurementReady = tracking === "tracking" && reading.usesGlint && Boolean(manualScale) && reading.confidence >= 80;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="space-y-4">
        <div className="relative h-[590px] overflow-hidden rounded-3xl border border-white/10 bg-[#081310] shadow-[0_30px_90px_rgba(0,0,0,.35)] sm:aspect-[4/3] sm:h-auto sm:min-h-[520px]">
          <video ref={videoRef} playsInline muted className={`absolute inset-0 size-full object-cover ${facingMode === "user" ? "-scale-x-100" : ""}`} />
          <canvas ref={canvasRef} onClick={handleCalibrationClick} className={`absolute inset-0 size-full ${calibrating ? "z-20 cursor-crosshair" : "pointer-events-none"}`} aria-label="Đường đo phản xạ giác mạc và bề rộng khuôn mặt" />
          {!isActive && <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_center,rgba(99,219,192,.12),transparent_58%)]"><div className="max-w-sm px-6 text-center"><div className="mx-auto grid size-24 place-items-center rounded-full border border-dashed border-[#63dbc0]/35 bg-[#63dbc0]/7"><Crosshair className="size-11 text-[#63dbc0]" /></div><p className="mt-5 text-lg font-medium text-white">Quét tâm đồng tử trực tiếp</p><p className="mt-2 text-sm leading-6 text-[#7f958b]">Nhìn thẳng vào camera, tháo kính và giữ ánh sáng đều hai bên mắt.</p></div></div>}
          {isActive && tracking !== "tracking" && <div className="pointer-events-none absolute inset-0 grid place-items-center"><div className="h-[72%] w-[52%] rounded-[48%] border-2 border-dashed border-[#bdfc6a]/50" /></div>}
          {isActive && <div className="pointer-events-none absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/80 bg-white px-3 py-1.5 text-[10px] font-semibold text-[#07110f] shadow-[0_0_30px_rgba(255,255,255,.8)]"><span className="size-2.5 animate-pulse rounded-full bg-white ring-2 ring-[#07110f]" /> Nhìn vào chấm sáng</div>}
          {calibrating && <div className="pointer-events-none absolute inset-x-4 top-16 z-30 mx-auto max-w-lg rounded-2xl border border-white/20 bg-[#07110f]/92 p-3 text-center text-sm text-white shadow-2xl backdrop-blur-xl">Khung hình đã được đóng băng · {calibrationPoints.length ? "Chạm mép ngoài thứ hai của thẻ" : "Chạm mép ngoài thứ nhất của thẻ"}</div>}
          <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full border border-white/10 bg-[#07110f]/82 px-3 py-2 text-xs backdrop-blur-xl"><span className={`size-2 rounded-full ${tracking === "tracking" ? "bg-[#bdfc6a]" : tracking === "error" ? "bg-rose-400" : "bg-amber-300"}`} /><span>{trackingLabel(tracking)}</span>{tracking === "tracking" && <span className="text-[#71877d]">· {Math.round(reading.confidence)}%</span>}</div>
          {captured && <div className="absolute right-4 top-4 rounded-full border border-[#bdfc6a]/20 bg-[#bdfc6a]/12 px-3 py-2 text-xs text-[#d7ff9f] backdrop-blur-xl"><Check className="mr-1 inline size-3.5" /> Đã giữ kết quả</div>}
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-white/10 bg-[#07110f]/86 p-2 backdrop-blur-xl">
            {!isActive ? <Button onClick={() => startCamera()} className="bg-[#bdfc6a] text-[#07110f] hover:bg-[#d0ff91]"><Camera /> Mở camera</Button> : <><Button onClick={flipCamera} disabled={tracking === "loading" || calibrating} variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"><RefreshCw /> Đổi camera</Button><Button onClick={() => setCaptured(measurementReady ? reading : null)} disabled={!measurementReady || calibrating} className="bg-[#bdfc6a] text-[#07110f] hover:bg-[#d0ff91]"><Crosshair /> Giữ kết quả</Button><Button onClick={stopCamera} variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"><CameraOff /> Tắt</Button></>}
          </div>
        </div>
        {errorMessage && <div className="rounded-2xl border border-rose-400/20 bg-rose-400/8 p-4 text-sm text-rose-200">{errorMessage}</div>}
        <div className="grid gap-3 sm:grid-cols-3"><StatusCard icon={<Sparkles />} label="Phản xạ giác mạc" value={reading.usesGlint ? `Đã khóa · ${Math.round(reading.reflection)}%` : "Tìm glint hai mắt"} ready={reading.usesGlint} /><StatusCard icon={<ScanFace />} label="Tư thế" value={poseLabel(reading)} ready={reading.roll <= 3 && reading.yaw <= 0.08 && Boolean(reading.pd)} /><StatusCard icon={<CreditCard />} label="Tỷ lệ milimét" value={manualScale ? "Đã hiệu chuẩn thẻ" : "Chưa hiệu chuẩn"} ready={Boolean(manualScale)} /></div>
      </section>

      <aside className="space-y-4">
        <section className="rounded-3xl border border-white/10 bg-[#0b1815] p-5"><div className="flex items-center justify-between"><p className="text-xs font-semibold tracking-[.16em] text-[#63dbc0]">PCCR · KẾT QUẢ</p><span className={`rounded-full px-2 py-1 text-[10px] ${display.pd ? "bg-[#bdfc6a]/10 text-[#cfff91]" : "bg-amber-300/10 text-amber-200"}`}>{display.pd ? "Đã kiểm tra hợp lệ" : "Chưa có số đo hợp lệ"}</span></div><div className="mt-5 rounded-2xl border border-[#bdfc6a]/15 bg-[#bdfc6a]/6 p-5"><p className="text-sm text-[#91a79d]">Khoảng cách phản xạ giác mạc</p><p className="mt-2 text-5xl font-semibold tracking-[-.05em] text-white">{format(display.pd)}<span className="ml-2 text-lg text-[#91a79d]">mm</span></p><div className="mt-4 grid grid-cols-2 gap-2"><SmallMetric label="PD trái" value={format(display.leftPd)} /><SmallMetric label="PD phải" value={format(display.rightPd)} /></div>{!display.pd && <p className="mt-4 text-xs leading-5 text-amber-100/65">Không hiển thị mm cho đến khi phản xạ ổn định và phép hiệu chuẩn thẻ vượt kiểm tra hình học.</p>}</div><div className="mt-3 rounded-2xl border border-white/8 bg-black/15 p-4"><p className="text-sm text-[#91a79d]">Rộng mặt tại cao độ vành tai</p><p className="mt-1 text-3xl font-semibold text-white">{format(display.faceWidth)} <span className="text-base font-normal text-[#71877d]">mm</span></p><p className="mt-2 text-xs leading-5 text-[#63786f]">Ước lượng qua hai điểm thái dương gần vành tai; camera chính diện không nhìn được mép ngoài của tai.</p></div>{captured && <Button onClick={() => setCaptured(null)} variant="outline" className="mt-3 w-full border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"><RotateCcw /> Đo lại</Button>}</section>
        <section className="rounded-2xl border border-white/10 bg-[#0b1815] p-4"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#63dbc0]/10 text-[#63dbc0]"><CreditCard className="size-5" /></span><div><p className="text-sm font-medium text-white">Hiệu chuẩn thẻ 85,60 mm</p><p className="mt-1 text-xs leading-5 text-[#70857c]">Giữ thẻ ngang sát trán trước khi bấm. Hệ thống sẽ đóng băng hình để hai lần chạm không bị lệch do chuyển động.</p></div></div><Button onClick={calibrating ? cancelCardCalibration : beginCardCalibration} disabled={!calibrating && (!isActive || tracking !== "tracking" || !reading.usesGlint)} variant="outline" className="mt-4 w-full border-[#63dbc0]/20 bg-[#63dbc0]/7 text-[#a9e4d6] hover:bg-[#63dbc0]/12 hover:text-white"><Crosshair /> {calibrating ? "Hủy hiệu chuẩn" : manualScale ? "Hiệu chuẩn lại" : "Đóng băng & hiệu chuẩn"}</Button>{calibrationError && <p className="mt-3 rounded-xl border border-rose-400/15 bg-rose-400/7 p-3 text-xs leading-5 text-rose-200">{calibrationError}</p>}{manualScale && <div className="mt-3 flex items-center justify-between rounded-xl bg-[#bdfc6a]/7 px-3 py-2 text-xs"><span className="text-[#91a79d]">Tỷ lệ đã khóa</span><span className="font-medium text-[#cfff91]">{manualScale.toFixed(4)} mm/px</span></div>}</section>
        <section className="rounded-2xl border border-amber-300/12 bg-amber-300/5 p-4 text-xs leading-5 text-amber-100/70">Kết quả từ webcam là ước lượng phục vụ chọn gọng. Đơn kính, lắp tròng hoặc quyết định lâm sàng cần được đo lại bằng pupillometer tại cơ sở nhãn khoa.</section>
      </aside>
    </div>
  );
}

function findCornealReflection(video: HTMLVideoElement, workCanvas: HTMLCanvasElement, landmarks: NormalizedLandmark[], centerIndex: number, perimeterIndices: number[]): Glint {
  const center = { x: landmarks[centerIndex].x * video.videoWidth, y: landmarks[centerIndex].y * video.videoHeight };
  const irisRadius = Math.max(...perimeterIndices.map((index) => Math.hypot(landmarks[index].x * video.videoWidth - center.x, landmarks[index].y * video.videoHeight - center.y)));
  const cropRadius = Math.max(10, irisRadius * 1.15);
  const sourceX = Math.max(0, center.x - cropRadius);
  const sourceY = Math.max(0, center.y - cropRadius);
  const sourceWidth = Math.min(video.videoWidth - sourceX, cropRadius * 2);
  const sourceHeight = Math.min(video.videoHeight - sourceY, cropRadius * 2);
  if (sourceWidth <= 1 || sourceHeight <= 1) return null;

  const sampleSize = 48;
  workCanvas.width = sampleSize;
  workCanvas.height = sampleSize;
  const ctx = workCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sampleSize, sampleSize);
  const pixels = ctx.getImageData(0, 0, sampleSize, sampleSize).data;
  const localCenter = { x: ((center.x - sourceX) / sourceWidth) * sampleSize, y: ((center.y - sourceY) / sourceHeight) * sampleSize };
  const allowedRadius = Math.max(5, (irisRadius * 0.72 / sourceWidth) * sampleSize);
  let best = 0;
  for (let y = 0; y < sampleSize; y++) for (let x = 0; x < sampleSize; x++) {
    if (Math.hypot(x - localCenter.x, y - localCenter.y) > allowedRadius) continue;
    const offset = (y * sampleSize + x) * 4;
    const r = pixels[offset]; const g = pixels[offset + 1]; const b = pixels[offset + 2];
    const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    best = Math.max(best, luminance - chroma * 1.35);
  }
  if (best < 188) return null;

  let sumX = 0; let sumY = 0; let sumWeight = 0; let count = 0;
  for (let y = 0; y < sampleSize; y++) for (let x = 0; x < sampleSize; x++) {
    if (Math.hypot(x - localCenter.x, y - localCenter.y) > allowedRadius) continue;
    const offset = (y * sampleSize + x) * 4;
    const r = pixels[offset]; const g = pixels[offset + 1]; const b = pixels[offset + 2];
    const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    const score = luminance - chroma * 1.35;
    if (score < Math.max(184, best - 20)) continue;
    const weight = Math.pow(score - Math.max(180, best - 24), 2);
    sumX += x * weight; sumY += y * weight; sumWeight += weight; count += 1;
  }
  if (!sumWeight || count > 70) return null;
  const x = sumX / sumWeight; const y = sumY / sumWeight;
  const compactness = Math.max(0, Math.min(1, 1 - Math.max(0, count - 24) / 46));
  const quality = Math.max(0, Math.min(1, ((best - 188) / 55) * 0.75 + compactness * 0.25));
  return { point: { x: sourceX + x / sampleSize * sourceWidth, y: sourceY + y / sampleSize * sourceHeight }, quality };
}

function drawMeasurement(ctx: CanvasRenderingContext2D, left: Point, right: Point, nose: Point, templeLeft: Point, templeRight: Point, reading: Reading, width: number) {
  const good = reading.confidence >= 70;
  ctx.save(); ctx.lineCap = "round"; ctx.shadowBlur = 12; ctx.shadowColor = good ? "rgba(189,252,106,.5)" : "rgba(251,191,36,.45)"; ctx.strokeStyle = good ? "#bdfc6a" : "#fbbf24"; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(left.x, left.y); ctx.lineTo(right.x, right.y); ctx.stroke();
  [left, right].forEach((pupil) => { ctx.beginPath(); ctx.arc(pupil.x, pupil.y, 6, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(pupil.x, pupil.y, 13, 0, Math.PI * 2); ctx.stroke(); });
  ctx.beginPath(); ctx.moveTo(nose.x, nose.y - 8); ctx.lineTo(nose.x, nose.y + 8); ctx.stroke();
  label(ctx, reading.pd ? `${reading.pd.toFixed(1)} mm CR-PD` : "Chưa có tỷ lệ mm hợp lệ", (left.x + right.x) / 2, Math.min(left.y, right.y) - 28, width);
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
function format(value: number) { return value > 0 ? value.toFixed(1) : "—"; }
function trackingLabel(state: TrackingState) { if (state === "loading") return "Đang tải AI mắt"; if (state === "searching") return "Đang tìm khuôn mặt"; if (state === "tracking") return "Đang đo trực tiếp"; if (state === "error") return "Camera chưa sẵn sàng"; return "Camera đang tắt"; }
function poseLabel(reading: Reading) { if (!reading.reflection) return "Chờ khuôn mặt"; if (reading.roll > 3) return "Giữ đầu ngang"; if (reading.yaw > 0.08) return "Nhìn thẳng hơn"; return "Đạt chuẩn đo"; }
function SmallMetric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-black/15 p-3"><span className="block text-xs text-[#70857c]">{label}</span><span className="mt-1 block text-lg font-medium text-white">{value} mm</span></div>; }
function StatusCard({ icon, label, value, ready }: { icon: React.ReactNode; label: string; value: string; ready?: boolean }) { return <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0b1815] p-4"><span className={`grid size-9 shrink-0 place-items-center rounded-lg ${ready ? "bg-[#bdfc6a]/10 text-[#bdfc6a]" : "bg-white/5 text-[#70857c]"}`}>{icon}</span><span><span className="block text-xs text-[#70857c]">{label}</span><span className="mt-1 block text-sm text-white">{value}</span></span></div>; }
