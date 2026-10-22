import Image from "next/image";

export function BrandLogo({ width = 180 }: { width?: number }) {
  return <Image src="/brand/finova-primary-logo-on-white.png" alt="Finova — Rõ tiền, vững tương lai" width={width} height={Math.round(width * 457 / 1282)} style={{ width, maxWidth: "100%", height: "auto" }} priority />;
}
