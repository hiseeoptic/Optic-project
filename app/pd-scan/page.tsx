import { ChevronRight, Eye, Glasses, Info, Ruler, ScanFace } from "lucide-react";
import Link from "next/link";

import { PdFaceScanner } from "@/components/pd-face-scanner";

export default function PdScanPage() {
  return (
    <main className="min-h-screen bg-[#07110f] text-[#eaf5ef]">
      <header className="border-b border-white/10 bg-[#07110f]/92 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-5 py-4 lg:px-8">
          <Link href="/" className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#bdfc6a] text-[#07110f]"><Glasses className="size-5" /></span><span><span className="block font-semibold">Kính 3D & AI</span><span className="block text-xs text-[#91a79d]">Pupil & Face Scan</span></span></Link>
          <div className="hidden items-center gap-2 text-sm text-[#91a79d] md:flex"><span className="text-white">Khóa khuôn mặt</span><ChevronRight className="size-4" /><span>Bắt tâm đồng tử</span><ChevronRight className="size-4" /><span>Đọc kích thước</span></div>
          <Link href="/try-on" className="rounded-lg border border-white/12 bg-white/5 px-3 py-2 text-sm text-[#b7c7bf] hover:bg-white/10 hover:text-white">Virtual try-on</Link>
        </div>
      </header>
      <div className="mx-auto max-w-[1500px] px-5 py-7 lg:px-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div><p className="mb-2 text-xs font-semibold tracking-[.18em] text-[#63dbc0]">ĐO LAI · ĐƠN GIẢN HƠN</p><h1 className="text-3xl font-semibold tracking-[-.04em] text-white md:text-5xl">Đo khoảng cách mắt đã hiệu chuẩn</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-[#81988e]">AI theo dõi tâm mống mắt, dùng thẻ chuẩn 85,60 mm để đổi pixel thành kích thước thật và tự bổ sung phản xạ giác mạc khi camera nhìn thấy. Bạn không cần căn glint mới tiếp tục được.</p></div>
          <div className="flex items-center gap-2 rounded-full border border-[#63dbc0]/15 bg-[#63dbc0]/6 px-3 py-2 text-xs text-[#9ed8ca]"><Eye className="size-3.5" /> Không tải video lên máy chủ</div>
        </div>
        <PdFaceScanner />
        <div className="mt-5 grid gap-3 md:grid-cols-3"><Guide icon={<ScanFace />} title="1. Giữ mặt chính diện" text="Camera ngang tầm mắt, tháo kính và nhìn vào chấm trắng. Glint được tìm hoàn toàn tự động." /><Guide icon={<Eye />} title="2. Hiệu chuẩn thẻ" text="Áp thẻ ngân hàng 85,60 mm ngang lên trán rồi đánh dấu hai mép ngay trên hình đã đóng băng." /><Guide icon={<Ruler />} title="3. Giữ kết quả" text="Chỉ cần tỷ lệ thẻ hợp lệ và tư thế ổn định; glint là lớp tăng cường, không còn bắt buộc." /></div>
        <div className="mt-4 flex gap-3 rounded-2xl border border-white/8 bg-white/[.025] p-4 text-xs leading-5 text-[#70857c]"><Info className="mt-0.5 size-4 shrink-0 text-[#63dbc0]" /><p>Chấm sáng được đo là phản xạ Purkinje I trên bề mặt giác mạc, không phải ánh sáng phát ra từ đồng tử. Đường xanh lam vẫn là bề rộng thái dương gần cao độ tai; đo đúng mép tai cần thêm góc chụp hoặc cảm biến chiều sâu.</p></div>
      </div>
    </main>
  );
}

function Guide({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="flex gap-3 rounded-2xl border border-white/10 bg-[#0b1815] p-4"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#63dbc0]/10 text-[#63dbc0]">{icon}</span><div><h2 className="text-sm font-medium text-white">{title}</h2><p className="mt-1 text-xs leading-5 text-[#71877d]">{text}</p></div></div>;
}
