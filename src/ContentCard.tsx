import { useId, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { bytes } from "./api";
import { Badge, Button, PackageArtwork, TypeIcon } from "./components";
import type { Content, Package } from "./types";
import "./content-grid.css";

const categoryNames: Record<Package["type"], string> = {
  car: "Car",
  track: "Circuit",
  config: "Configuration",
  app: "App",
};

export function ContentCard({
  item,
  disabled,
  onSelect,
  onAction,
}: {
  item: Content;
  disabled: boolean;
  onSelect: () => void;
  onAction: () => void;
}) {
  const titleId = useId();
  const p = item.package as Package & { image?: string | null };
  const [failedImage, setFailedImage] = useState<string>();
  const image = p.image?.trim();
  const showImage =
    !!image && /^https:\/\//i.test(image) && image !== failedImage;
  const action =
    item.state === "ready"
      ? "Verify"
      : item.state === "corrupted"
        ? "Repair"
        : item.state === "outdated"
          ? "Update"
          : "Install";

  return (
    <article className="content-card" aria-labelledby={titleId}>
      <div className={`content-card-artwork ${showImage ? "has-photo" : ""}`}>
        {showImage ? (
          <img
            className="content-card-photo"
            src={image}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setFailedImage(image)}
          />
        ) : (
          <div className="content-card-placeholder" aria-hidden="true">
            <TypeIcon type={p.type} />
          </div>
        )}
        <div className="content-card-shade" aria-hidden="true" />
        <button
          type="button"
          className="content-card-open"
          aria-labelledby={titleId}
          aria-haspopup="dialog"
          onClick={onSelect}
        />
        <div className="content-card-category">
          <PackageArtwork package={p} className="content-card-icon" />
          <span>{categoryNames[p.type]}</span>
          <span className="content-card-requirement">
            {p.required ? "Required" : "Optional"}
          </span>
        </div>
        <h2 className="content-card-title" id={titleId}>
          <span>{p.name}</span>
          <ArrowUpRight size={17} aria-hidden="true" />
        </h2>
      </div>
      <div className="content-card-body">
        <p className="content-card-description">{p.description}</p>
        <dl className="content-card-metadata">
          <div>
            <dt>Latest version</dt>
            <dd>v{p.version}</dd>
          </div>
          <div>
            <dt>Size</dt>
            <dd>{bytes(p.size)}</dd>
          </div>
        </dl>
        <div className="content-card-footer">
          <Badge state={item.state} />
          <Button
            type="button"
            variant={item.state === "ready" ? "" : "primary"}
            disabled={disabled}
            onClick={onAction}
          >
            {action}
            <ArrowUpRight size={14} aria-hidden="true" />
          </Button>
        </div>
      </div>
    </article>
  );
}
