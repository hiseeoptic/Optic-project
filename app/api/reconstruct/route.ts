const MESHY_ENDPOINT = "https://api.meshy.ai/openapi/v1/multi-image-to-3d";

type MeshyTaskResponse = {
  id?: string;
  status?: string;
  progress?: number;
  model_urls?: { glb?: string };
  thumbnail_url?: string;
  thumbnail_urls?: string[];
  task_error?: { message?: string };
  message?: string;
};

type MeshyCreateResponse = { result?: string; message?: string };

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function apiKey() {
  return process.env.MESHY_API_KEY?.trim();
}

export async function GET(request: Request) {
  const key = apiKey();
  const taskId = new URL(request.url).searchParams.get("taskId");
  if (!taskId) return json({ configured: Boolean(key), provider: "Meshy Multi-Image-to-3D" });
  if (!key) return json({ error: "MESHY_API_KEY chưa được cấu hình trên máy chủ." }, 503);
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(taskId)) return json({ error: "Mã tác vụ không hợp lệ." }, 400);

  const response = await fetch(`${MESHY_ENDPOINT}/${taskId}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const body = await response.json().catch(() => ({ message: "Meshy không trả về JSON hợp lệ." })) as MeshyTaskResponse;
  if (!response.ok) return json({ error: body?.message ?? "Không thể đọc trạng thái tác vụ 3D." }, response.status);
  return json({
    id: body.id,
    status: body.status,
    progress: body.progress ?? 0,
    modelUrl: body.model_urls?.glb ?? null,
    previewUrl: body.thumbnail_url ?? null,
    previews: body.thumbnail_urls ?? null,
    error: body.task_error?.message || null,
  });
}

export async function POST(request: Request) {
  const key = apiKey();
  if (!key) return json({ error: "MESHY_API_KEY chưa được cấu hình trên máy chủ." }, 503);

  const body = await request.json().catch(() => null) as { images?: unknown } | null;
  if (!body || !Array.isArray(body.images) || body.images.length < 2 || body.images.length > 4) {
    return json({ error: "Cần từ 2 đến 4 ảnh của cùng một chiếc kính." }, 400);
  }
  const images = body.images.filter((value): value is string => typeof value === "string");
  if (images.length !== body.images.length || images.some((value) => !/^data:image\/(jpeg|png|webp);base64,/.test(value) || value.length > 6_000_000)) {
    return json({ error: "Ảnh phải là JPEG, PNG hoặc WebP và không vượt quá giới hạn xử lý." }, 400);
  }

  const response = await fetch(MESHY_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      image_urls: images,
      ai_model: "meshy-7.1",
      geometry_resolution: "2k",
      should_texture: true,
      enable_pbr: true,
      target_formats: ["glb"],
      multi_view_thumbnails: true,
    }),
  });
  const result = await response.json().catch(() => ({ message: "Meshy không trả về JSON hợp lệ." })) as MeshyCreateResponse;
  if (!response.ok) return json({ error: result?.message ?? "Không thể tạo tác vụ AI 3D." }, response.status);
  if (!result.result) return json({ error: "Meshy không trả về mã tác vụ 3D." }, 502);
  return json({ taskId: result.result });
}
