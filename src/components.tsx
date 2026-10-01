import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import {
  X,
  ArrowUpRight,
  Car,
  MapPin,
  SlidersHorizontal,
  Blocks,
} from "lucide-react";
import { bytes } from "./api";
import type { Content, Package } from "./types";
export function Button({
  children,
  variant = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) {
  return (
    <button {...props} className={`button ${variant} ${props.className ?? ""}`}>
      {children}
    </button>
  );
}
export function Badge({
  state,
  children,
}: {
  state: string;
  children?: ReactNode;
}) {
  return (
    <span className={`badge ${state}`}>
      <span className="dot" />
      {children ??
        {
          ready: "Up to date",
          outdated: "Update available",
          missing: "Not installed",
          unverified: "Not verified",
          corrupted: "Repair required",
        }[state] ??
        state.replaceAll("-", " ")}
    </span>
  );
}
export function Progress({ value, label }: { value: number; label: string }) {
  return (
    <div
      className="progress"
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        style={{
          transform: `scaleX(${Math.max(0, Math.min(100, value)) / 100})`,
        }}
      />
    </div>
  );
}
export function EmptyState({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
export function Modal({
  title,
  onClose,
  children,
  className = "",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.showModal();
    return () => {
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={className}
      onCancel={onClose}
      aria-labelledby="modal-title"
    >
      <div className="modal-heading">
        <h2 id="modal-title">{title}</h2>
        <Button aria-label="Close details" onClick={onClose}>
          <X size={18} />
        </Button>
      </div>
      {children}
    </dialog>
  );
}
export const TypeIcon = ({ type }: { type: string }) => {
  const Icon =
    type === "car"
      ? Car
      : type === "track"
        ? MapPin
        : type === "config"
          ? SlidersHorizontal
          : Blocks;
  return <Icon size={20} aria-hidden="true" />;
};
export function PackageArtwork({
  package: item,
  className = "",
}: {
  package: Pick<Package, "type" | "icon">;
  className?: string;
}) {
  const [failedIcon, setFailedIcon] = useState<string>();
  const icon = item.icon;
  const showImage = !!icon && /^https:\/\//i.test(icon) && icon !== failedIcon;
  return (
    <span
      className={`type-icon package-artwork ${item.type} ${showImage ? "has-artwork" : ""} ${className}`}
      aria-hidden="true"
    >
      {showImage ? (
        <img
          src={icon}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailedIcon(icon)}
        />
      ) : (
        <TypeIcon type={item.type} />
      )}
    </span>
  );
}
export function ContentRow({
  item,
  onSelect,
  onAction,
  disabled,
}: {
  item: Content;
  onSelect: () => void;
  onAction: () => void;
  disabled: boolean;
}) {
  const p = item.package;
  return (
    <div className="content-row" role="row">
      <div role="cell" className="package-name">
        <PackageArtwork package={p} />
        <button className="text-button" onClick={onSelect}>
          {p.name}
          <span>
            {p.type.toUpperCase()} <b>·</b>{" "}
            {p.required ? "REQUIRED" : "OPTIONAL"}
          </span>
        </button>
      </div>
      <div className="version-cell" role="cell">
        <span>v{p.version}</span>
        <small>{bytes(p.size)}</small>
      </div>
      <div role="cell">
        <Badge state={item.state} />
      </div>
      <div role="cell" className="row-action">
        <Button disabled={disabled} onClick={onAction}>
          {item.state === "ready"
            ? "Verify"
            : item.state === "corrupted"
              ? "Repair"
              : item.state === "outdated"
                ? "Update"
                : "Install"}
          <ArrowUpRight size={14} />
        </Button>
      </div>
    </div>
  );
}
