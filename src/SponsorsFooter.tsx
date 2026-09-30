import { useId, useState } from "react";
import { httpsUrl, type Sponsor } from "./portal-types";
import "./portal.css";

function SponsorLink({ sponsor }: { sponsor: Sponsor }) {
  const [failedLogo, setFailedLogo] = useState<string>();
  const logo = httpsUrl(sponsor.logo);
  const showLogo = !!logo && failedLogo !== logo;
  return (
    <a
      className="sponsor-link"
      href={httpsUrl(sponsor.url) ?? undefined}
      target="_blank"
      rel="noopener noreferrer"
      title={sponsor.name}
    >
      {showLogo ? (
        <img
          src={logo}
          alt={sponsor.name}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailedLogo(logo)}
        />
      ) : (
        <span>{sponsor.name}</span>
      )}
    </a>
  );
}

export function SponsorsFooter({ sponsors }: { sponsors: Sponsor[] }) {
  const titleId = useId();
  const published = sponsors
    .filter((sponsor) => httpsUrl(sponsor.url))
    .slice()
    .sort(
      (a, b) =>
        (a.order ?? 999) - (b.order ?? 999) || a.name.localeCompare(b.name),
    );
  if (!published.length) return null;
  return (
    <section className="sponsors-footer" aria-labelledby={titleId}>
      <h2 id={titleId}>Championship partners</h2>
      <div className="sponsors-list">
        {published.map((sponsor) => (
          <SponsorLink sponsor={sponsor} key={sponsor.id} />
        ))}
      </div>
    </section>
  );
}
