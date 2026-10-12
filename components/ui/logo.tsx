import Image from "next/image";

// TITLE: BRAND LOGO
export function Logo({ size = "md", priority = false }) {
  return <div className={`logo logo-${size}`}><Image src="/logo-mark.jpg" alt="The Cubicle OS" fill priority={priority} sizes="96px" /></div>;
}
