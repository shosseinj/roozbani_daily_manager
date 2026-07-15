import { headers } from "next/headers";
import type { Metadata } from "next";
import PhdCommandCenter from "./phd-command-center";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "مسیر پژوهش و اپلای دکتری — روزبانی",
  description: "فرماندهی موقعیت‌های دکتری، اپلای، زبان، پژوهش و مهاجرت با اتصال مستقیم به برنامه روزانه.",
};

export default async function PhdPage() {
  const incoming = await headers();
  const encoded = incoming.get("oai-authenticated-user-full-name");
  let name = "پژوهشگر";
  if (encoded) {
    try { name = decodeURIComponent(encoded).split(" ")[0] || name; } catch { /* keep fallback */ }
  }
  return <PhdCommandCenter initialName={name} />;
}
