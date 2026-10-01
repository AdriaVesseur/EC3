import { useEffect, useMemo, useState } from "react";
import {
  CarFront,
  ChevronRight,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { api, apiImage } from "./api";
import type { Content } from "./types";
import { Button, EmptyState, Modal, PackageArtwork } from "./components";

type LocalSkin = {
  id: string;
  name: string;
  number: string | null;
  hasPreview: boolean;
};
type LocalCar = {
  id: string;
  name: string;
  version: string;
  folder: string;
  skins: LocalSkin[];
};

function SkinArtwork({ carId, skin }: { carId: string; skin: LocalSkin }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    if (!skin.hasPreview) return;
    const controller = new AbortController();
    let objectUrl = "";
    apiImage(
      `/my-content/cars/${encodeURIComponent(carId)}/skins/${encodeURIComponent(skin.id)}/preview`,
      controller.signal,
    )
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {});
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [carId, skin.id, skin.hasPreview]);
  return src ? (
    <img src={src} alt={`${skin.name} livery`} />
  ) : (
    <div className="my-content-skin-empty">
      <CarFront size={27} />
      <span>{skin.hasPreview ? "Loading preview" : "No preview"}</span>
    </div>
  );
}

export function MyContentPage({
  content,
  connected,
}: {
  content: Content[];
  connected: boolean;
}) {
  const [cars, setCars] = useState<LocalCar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const installedPackages = useMemo(
    () => new Map(content.map((item) => [item.package.id, item.package])),
    [content],
  );
  const visibleCars = cars.filter((car) =>
    car.name.toLowerCase().includes(query.toLowerCase()),
  );
  const selectedCar = cars.find((car) => car.id === selectedId);
  const selectedPackage = selectedCar
    ? installedPackages.get(selectedCar.id)
    : null;

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const inventory = await api<LocalCar[]>("/my-content/cars");
      setCars(inventory);
      setSelectedId((current) =>
        inventory.some((car) => car.id === current) ? current : "",
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not read launcher-installed cars.",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (connected) void refresh();
    else {
      setCars([]);
      setLoading(false);
    }
  }, [connected]);

  return (
    <section className="my-content-page" aria-label="My Content garage">
      <div className="my-content-toolbar">
        <div className="my-content-inventory">
          <span className="my-content-count">
            {cars.length.toString().padStart(2, "0")}
          </span>
          <span>
            <strong>LAUNCHER GARAGE</strong>
            <small>Cars installed through this launcher</small>
          </span>
        </div>
        <label className="my-content-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search your cars"
            aria-label="Search your cars"
          />
        </label>
        <Button onClick={() => void refresh()} disabled={!connected || loading}>
          <RefreshCw size={15} />
          Refresh
        </Button>
      </div>
      {error && (
        <div className="my-content-error" role="alert">
          {error}
        </div>
      )}
      {loading ? (
        <div className="my-content-loading">
          <RefreshCw size={17} className="spin" />
          Reading your installed cars…
        </div>
      ) : !connected ? (
        <EmptyState title="Connect the desktop helper">
          My Content reads launcher receipts from your Assetto Corsa
          installation.
        </EmptyState>
      ) : visibleCars.length ? (
        <div className="my-content-grid">
          {visibleCars.map((car) => {
            const item = installedPackages.get(car.id);
            const open = selectedId === car.id;
            return (
              <article
                className={`my-content-card ${open ? "is-selected" : ""}`}
                key={car.id}
              >
                <button
                  className="my-content-card-cover"
                  onClick={() => setSelectedId(open ? "" : car.id)}
                  aria-expanded={open}
                  aria-label={`${open ? "Close" : "View"} ${car.name}`}
                >
                  {item?.image ? (
                    <img src={item.image} alt="" />
                  ) : (
                    <div className="my-content-cover-empty">
                      <PackageArtwork
                        package={
                          item ?? {
                            id: car.id,
                            name: car.name,
                            type: "car",
                            version: car.version,
                            download: "",
                            size: 0,
                            sha256: "",
                            installPath: "",
                            required: false,
                            files: [],
                            dependencies: [],
                            description: "",
                          }
                        }
                      />
                      <CarFront size={38} />
                    </div>
                  )}
                  <span className="my-content-cover-shade" />
                  <span className="my-content-card-title">
                    <strong>{car.name}</strong>
                    <small>
                      v{car.version} <i /> {car.skins.length}{" "}
                      {car.skins.length === 1 ? "skin" : "skins"}
                    </small>
                  </span>
                  <ChevronRight size={18} className="my-content-card-arrow" />
                </button>
                <div className="my-content-card-meta">
                  <span>
                    <ShieldCheck size={14} />
                    Installed by Eurocup 3
                  </span>
                  <span>{car.folder}</span>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title={query ? "No matching cars" : "No launcher-installed cars yet"}
        >
          {query
            ? "Try another search."
            : "Cars appear here after the EC3 launcher installs them. Cars installed manually in Assetto Corsa are intentionally left out."}
        </EmptyState>
      )}
      {selectedCar && (
        <Modal
          title={selectedCar.name}
          onClose={() => setSelectedId("")}
          className="my-content-detail-dialog"
        >
          <section className="my-content-detail">
            <header className="my-content-detail-meta">
              <span className="eyebrow">
                YOUR GARAGE · {selectedCar.folder}
              </span>
              <p>Installed version {selectedCar.version}</p>
            </header>
            {selectedPackage?.image && (
              <div
                className="my-content-detail-hero"
                style={{
                  backgroundImage: `linear-gradient(0deg, rgb(11 12 14 / 75%), transparent 65%), url("${selectedPackage.image}")`,
                }}
              >
                <span>ASSETTO CORSA · INSTALLED CAR</span>
              </div>
            )}
            <div className="my-content-detail-section">
              <div className="my-content-section-title">
                <div>
                  <span className="eyebrow">PAINTS & SKINS</span>
                  <h3>{selectedCar.skins.length} available</h3>
                </div>
                <span className="my-content-readonly">LOCAL SKIN PREVIEWS</span>
              </div>
              {selectedCar.skins.length ? (
                <div className="my-content-skins">
                  {selectedCar.skins.map((skin) => (
                    <article className="my-content-skin" key={skin.id}>
                      <div className="my-content-skin-preview">
                        <SkinArtwork carId={selectedCar.id} skin={skin} />
                      </div>
                      <div className="my-content-skin-name">
                        <strong>{skin.name}</strong>
                        {skin.number && <span>#{skin.number}</span>}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="my-content-no-skins">
                  No skins found in this car's local folder.
                </p>
              )}
            </div>
            <footer>
              <span>
                <ShieldCheck size={15} />
                Launcher ownership verified from its install record
              </span>
              <span>
                Folder: <code>content/cars/{selectedCar.folder}</code>
              </span>
            </footer>
          </section>
        </Modal>
      )}
    </section>
  );
}
