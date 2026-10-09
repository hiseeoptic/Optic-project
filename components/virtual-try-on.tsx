"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Check, RefreshCw, ScanFace, ShieldCheck } from "lucide-react";
import { FaceLandmarker, FilesetResolver, type NormalizedLandmark } from "@mediapipe/tasks-vision";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { Button } from "@/components/ui/button";
import { buildGlassesModel, disposeGlassesModel } from "@/lib/glasses-model";

type TrackingState = "idle" | "loading" | "searching" | "tracking" | "error";
type FacingMode = "user" | "environment";

type VirtualTryOnProps = {
  lensWidth: number;
  lensHeight: number;
  bridge: number;
  temple: number;
  color: string;
  modelUrl?: string | null;
};

type Pose = { x: number; y: number; scale: number; roll: number; yaw: number };

export function VirtualTryOn({ lensWidth, lensHeight, bridge, temple, color, modelUrl }: VirtualTryOnProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const glassesRef = useRef<THREE.Group | null>(null);
  const renderAnimationRef = useRef(0);
  const trackingAnimationRef = useRef(0);
  const trackingLoopRef = useRef<() => void>(() => undefined);
  const lastVideoTimeRef = useRef(-1);
  const trackingRef = useRef<TrackingState>("idle");
  const poseRef = useRef<Pose>({ x: 0, y: 0, scale: 1, roll: 0, yaw: 0 });
  const frameCounterRef = useRef({ frames: 0, time: 0 });
  const facingModeRef = useRef<FacingMode>("user");
  const [tracking, setTracking] = useState<TrackingState>("idle");
  const [facingMode, setFacingMode] = useState<FacingMode>("user");
  const [fps, setFps] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");

  const setTrackingSafe = useCallback((next: TrackingState) => {
    if (trackingRef.current !== next) {
      trackingRef.current = next;
      setTracking(next);
    }
  }, []);

  useEffect(() => {
    const mount = overlayRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight("#ffffff", "#16352b", 3.2));
    const key = new THREE.DirectionalLight("#ffffff", 4.5);
    key.position.set(-100, 100, 160);
    scene.add(key);
    const edge = new THREE.DirectionalLight("#63dbc0", 2.2);
    edge.position.set(120, 20, 80);
    scene.add(edge);

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1000, 1000);
    camera.position.z = 500;
    cameraRef.current = camera;

    let glasses = buildGlassesModel({ lensWidth, lensHeight, bridge, temple, color });
    glasses.visible = false;
    scene.add(glasses);
    glassesRef.current = glasses;
    let fallbackDisposed = false;
    if (modelUrl) {
      new GLTFLoader().load(modelUrl, (gltf) => {
        if (!mount.isConnected) {
          disposeGlassesModel(gltf.scene);
          return;
        }
        const imported = gltf.scene;
        const box = new THREE.Box3().setFromObject(imported);
        const size = box.getSize(new THREE.Vector3());
        const modelWidth = lensWidth * 2 + bridge + 12;
        imported.scale.setScalar(modelWidth / Math.max(size.x, 0.001));
        const scaledBox = new THREE.Box3().setFromObject(imported);
        const center = scaledBox.getCenter(new THREE.Vector3());
        imported.position.sub(center);
        const wrapper = new THREE.Group();
        wrapper.name = "AI_scanned_glasses";
        wrapper.add(imported);
        wrapper.visible = false;
        scene.remove(glasses);
        disposeGlassesModel(glasses);
        fallbackDisposed = true;
        glasses = wrapper;
        glassesRef.current = wrapper;
        scene.add(wrapper);
      });
    }

    const resize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.left = -width / 2;
      camera.right = width / 2;
      camera.top = height / 2;
      camera.bottom = -height / 2;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    const render = () => {
      renderer.render(scene, camera);
      renderAnimationRef.current = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(renderAnimationRef.current);
      observer.disconnect();
      if (!fallbackDisposed || glasses.name === "AI_scanned_glasses") disposeGlassesModel(glasses);
      renderer.dispose();
      renderer.domElement.remove();
      rendererRef.current = null;
      cameraRef.current = null;
      glassesRef.current = null;
    };
  }, [bridge, color, lensHeight, lensWidth, modelUrl, temple]);

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(trackingAnimationRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    landmarkerRef.current?.close();
    landmarkerRef.current = null;
    if (glassesRef.current) glassesRef.current.visible = false;
    setFps(0);
    setTrackingSafe("idle");
  }, [setTrackingSafe]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const updateGlassesPose = useCallback((landmarks: NormalizedLandmark[], mirrored: boolean) => {
    const mount = overlayRef.current;
    const glasses = glassesRef.current;
    if (!mount || !glasses) return;
    const width = mount.clientWidth;
    const height = mount.clientHeight;
    const point = (index: number) => {
      const landmark = landmarks[index];
      return {
        x: (mirrored ? 1 - landmark.x : landmark.x) * width - width / 2,
        y: height / 2 - landmark.y * height,
        z: landmark.z,
      };
    };
    const average = (a: ReturnType<typeof point>, b: ReturnType<typeof point>) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });
    const eyeOne = average(point(33), point(133));
    const eyeTwo = average(point(362), point(263));
    const left = eyeOne.x < eyeTwo.x ? eyeOne : eyeTwo;
    const right = eyeOne.x < eyeTwo.x ? eyeTwo : eyeOne;
    const dx = right.x - left.x;
    const dy = right.y - left.y;
    const eyeDistance = Math.hypot(dx, dy);
    const modelWidth = lensWidth * 2 + bridge + 12;
    const target: Pose = {
      x: (left.x + right.x) / 2,
      y: (left.y + right.y) / 2 - eyeDistance * 0.05,
      scale: (eyeDistance * 2.15) / modelWidth,
      roll: Math.atan2(dy, dx),
      yaw: THREE.MathUtils.clamp((eyeOne.z - eyeTwo.z) * 3.8, -0.62, 0.62),
    };
    const pose = poseRef.current;
    pose.x = THREE.MathUtils.lerp(pose.x, target.x, 0.28);
    pose.y = THREE.MathUtils.lerp(pose.y, target.y, 0.28);
    pose.scale = THREE.MathUtils.lerp(pose.scale, target.scale, 0.24);
    pose.roll = THREE.MathUtils.lerp(pose.roll, target.roll, 0.3);
    pose.yaw = THREE.MathUtils.lerp(pose.yaw, target.yaw, 0.24);
    glasses.position.set(pose.x, pose.y, 0);
    glasses.scale.setScalar(pose.scale);
    glasses.rotation.set(-0.05, pose.yaw, pose.roll);
    glasses.visible = true;
  }, [bridge, lensWidth]);

  const runTracking = useCallback(() => {
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;
    const glasses = glassesRef.current;
    if (!video || !landmarker || !streamRef.current) return;
    if (video.readyState >= 2 && video.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime;
      const result = landmarker.detectForVideo(video, performance.now());
      const face = result.faceLandmarks[0];
      if (face) {
        updateGlassesPose(face, facingModeRef.current === "user");
        setTrackingSafe("tracking");
      } else {
        if (glasses) glasses.visible = false;
        setTrackingSafe("searching");
      }
      const counter = frameCounterRef.current;
      counter.frames += 1;
      const now = performance.now();
      if (now - counter.time >= 1000) {
        setFps(Math.round((counter.frames * 1000) / (now - counter.time)));
        frameCounterRef.current = { frames: 0, time: now };
      }
    }
    trackingAnimationRef.current = requestAnimationFrame(() => trackingLoopRef.current());
  }, [setTrackingSafe, updateGlassesPose]);

  useEffect(() => {
    trackingLoopRef.current = runTracking;
  }, [runTracking]);

  const startCamera = useCallback(async (mode: FacingMode = facingMode) => {
    stopCamera();
    setErrorMessage("");
    setTrackingSafe("loading");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Trình duyệt này chưa hỗ trợ camera web.");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 960 } },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("Không thể khởi tạo khung camera.");
      video.srcObject = stream;
      await video.play();

      const vision = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
      const options = {
        baseOptions: { modelAssetPath: "/mediapipe/face_landmarker.task", delegate: "GPU" as const },
        runningMode: "VIDEO" as const,
        numFaces: 1,
        minFaceDetectionConfidence: 0.55,
        minFacePresenceConfidence: 0.55,
        minTrackingConfidence: 0.55,
        outputFacialTransformationMatrixes: true,
      };
      try {
        landmarkerRef.current = await FaceLandmarker.createFromOptions(vision, options);
      } catch {
        landmarkerRef.current = await FaceLandmarker.createFromOptions(vision, { ...options, baseOptions: { ...options.baseOptions, delegate: "CPU" as const } });
      }
      facingModeRef.current = mode;
      setFacingMode(mode);
      lastVideoTimeRef.current = -1;
      frameCounterRef.current = { frames: 0, time: performance.now() };
      setTrackingSafe("searching");
      trackingAnimationRef.current = requestAnimationFrame(() => trackingLoopRef.current());
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      const message = error instanceof DOMException && error.name === "NotAllowedError"
        ? "Camera chưa được cho phép. Hãy bật quyền camera trong trình duyệt rồi thử lại."
        : error instanceof Error ? error.message : "Không thể mở camera.";
      setErrorMessage(message);
      setTrackingSafe("error");
    }
  }, [facingMode, setTrackingSafe, stopCamera]);

  const flipCamera = async () => {
    const next = facingMode === "user" ? "environment" : "user";
    facingModeRef.current = next;
    setFacingMode(next);
    await startCamera(next);
  };

  const isActive = tracking === "searching" || tracking === "tracking" || tracking === "loading";

  return (
    <div className="space-y-4">
      <div ref={stageRef} className="relative h-[560px] overflow-hidden rounded-3xl border border-white/10 bg-[#081310] shadow-[0_30px_90px_rgba(0,0,0,.35)] sm:aspect-[4/3] sm:h-auto sm:min-h-[480px]">
        <video ref={videoRef} playsInline muted className={`absolute inset-0 size-full object-cover ${facingMode === "user" ? "-scale-x-100" : ""}`} />
        <div ref={overlayRef} className="pointer-events-none absolute inset-0" aria-label="Lớp kính 3D theo dõi khuôn mặt" />

        {!isActive && (
          <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_center,rgba(99,219,192,.12),transparent_58%)]">
            <div className="text-center">
              <div className="mx-auto grid size-24 place-items-center rounded-full border border-dashed border-[#63dbc0]/35 bg-[#63dbc0]/7"><ScanFace className="size-11 text-[#63dbc0]" /></div>
              <p className="mt-5 text-lg font-medium text-white">Đặt khuôn mặt trong khung hình</p>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#7f958b]">Camera chỉ hoạt động sau khi bạn cho phép. Dữ liệu khuôn mặt được xử lý trực tiếp trên thiết bị.</p>
            </div>
          </div>
        )}

        {isActive && tracking !== "tracking" && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="h-[68%] w-[46%] rounded-[48%] border-2 border-dashed border-[#bdfc6a]/50 shadow-[0_0_70px_rgba(189,252,106,.08)]" />
          </div>
        )}

        <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full border border-white/10 bg-[#07110f]/80 px-3 py-2 text-xs backdrop-blur-xl">
          <span className={`size-2 rounded-full ${tracking === "tracking" ? "bg-[#bdfc6a]" : tracking === "error" ? "bg-rose-400" : "bg-amber-300"}`} />
          <span className="text-[#dcebe4]">{trackingLabel(tracking)}</span>
          {fps > 0 && <span className="text-[#63786f]">· {fps} FPS</span>}
        </div>

        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-white/10 bg-[#07110f]/82 p-2 backdrop-blur-xl">
          {!isActive ? (
            <Button onClick={() => startCamera()} className="bg-[#bdfc6a] text-[#07110f] hover:bg-[#d0ff91]"><Camera /> Mở camera</Button>
          ) : (
            <>
              <Button onClick={flipCamera} disabled={tracking === "loading"} variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"><RefreshCw /> Đổi camera</Button>
              <Button onClick={stopCamera} variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"><CameraOff /> Tắt</Button>
            </>
          )}
        </div>
      </div>

      {errorMessage && <div className="rounded-2xl border border-rose-400/20 bg-rose-400/8 p-4 text-sm text-rose-200">{errorMessage}</div>}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatusCard icon={<ShieldCheck />} label="Xử lý riêng tư" value="Trên thiết bị" ready />
        <StatusCard icon={<ScanFace />} label="Face landmarks" value={tracking === "tracking" ? "Đã khóa khuôn mặt" : "Chờ khuôn mặt"} ready={tracking === "tracking"} />
        <StatusCard icon={<Check />} label="Tài sản kính" value={modelUrl ? "AI Scan GLB" : `${lensWidth}-${bridge}-${temple} · Parametric`} ready />
      </div>
    </div>
  );
}

function trackingLabel(state: TrackingState) {
  if (state === "loading") return "Đang tải AI nhận diện";
  if (state === "searching") return "Đang tìm khuôn mặt";
  if (state === "tracking") return "Đang theo dõi khuôn mặt";
  if (state === "error") return "Camera chưa sẵn sàng";
  return "Camera đang tắt";
}

function StatusCard({ icon, label, value, ready }: { icon: React.ReactNode; label: string; value: string; ready?: boolean }) {
  return <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0b1815] p-4"><span className={`grid size-9 shrink-0 place-items-center rounded-lg ${ready ? "bg-[#bdfc6a]/10 text-[#bdfc6a]" : "bg-white/5 text-[#70857c]"}`}>{icon}</span><span><span className="block text-xs text-[#70857c]">{label}</span><span className="mt-1 block text-sm text-white">{value}</span></span></div>;
}
