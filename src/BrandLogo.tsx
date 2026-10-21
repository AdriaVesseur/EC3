import { brand } from "./brand";

export function BrandLogo({
  className = "",
  label,
}: {
  className?: string;
  label?: string;
}) {
  return (
    <span
      className={`brand-logo ${className}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <img src={brand.logo} alt="" />
    </span>
  );
}
