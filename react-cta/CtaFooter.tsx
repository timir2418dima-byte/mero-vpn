import { useEffect, useRef } from "react";
import { ArrowUpRight } from "lucide-react";

// Planet horizon instead of an HLS video: one static SVG, no network, no decoding.
// Only opacity (rim) and transform (server pings) animate, and both pause offscreen.
const CX = 600;
const CY = 1500;
const R = 1150;
const SERVERS = [
  [-24, 1130], [-15, 1100], [-9, 1136], [-4, 1112], [0, 1140],
  [3, 1095], [7, 1128], [12, 1104], [17, 1134], [25, 1112],
].map(([deg, r]) => {
  const t = (deg * Math.PI) / 180;
  return { x: CX + r * Math.sin(t), y: CY - r * Math.cos(t) };
});

const TRIAL_URL = "https://t.me/mero_vpn_bot?start=trial";
const SUPPORT_URL = "https://t.me/mero_vpn_bot?start=support";

type Props = {
  onPrivacy?: () => void;
  onTerms?: () => void;
};

const CtaFooter = ({ onPrivacy, onTerms }: Props) => {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([e]) => el.classList.toggle("is-live", e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="cta-finale relative isolate overflow-hidden bg-black px-6 pt-28 text-center md:px-16 lg:px-24"
    >
      {/* Background: planet horizon */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-full max-h-[640px]" aria-hidden="true">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1200 600" preserveAspectRatio="xMidYMax slice">
          <defs>
            <radialGradient id="hzFill" cx="50%" cy="0%" r="60%">
              <stop offset="0" stopColor="#0d2028" />
              <stop offset=".55" stopColor="#03080a" />
              <stop offset="1" stopColor="#000" />
            </radialGradient>
            <pattern id="hzGrid" width="22" height="22" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="rgba(226,236,245,.09)" />
            </pattern>
            <clipPath id="hzClip">
              <circle cx={CX} cy={CY} r={R} />
            </clipPath>
            <linearGradient id="hzRim" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="#4cc4ea" stopOpacity="0" />
              <stop offset=".5" stopColor="#bfefff" />
              <stop offset="1" stopColor="#4cc4ea" stopOpacity="0" />
            </linearGradient>
          </defs>
          <circle cx={CX} cy={CY} r={R} fill="url(#hzFill)" />
          <rect width="1200" height="600" fill="url(#hzGrid)" clipPath="url(#hzClip)" />
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="#4cc4ea" strokeOpacity=".07" strokeWidth="22" />
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="#4cc4ea" strokeOpacity=".14" strokeWidth="7" />
        </svg>
        <svg className="hz-live absolute inset-0 h-full w-full" viewBox="0 0 1200 600" preserveAspectRatio="xMidYMax slice">
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="url(#hzRim)" strokeWidth="1.6" />
          {SERVERS.map((s, i) => (
            <g key={i} style={{ ["--k" as string]: i }}>
              <circle className="hz-ping" cx={s.x} cy={s.y} r="7" />
              <circle cx={s.x} cy={s.y} r="2.4" fill="#d6f5ff" />
            </g>
          ))}
        </svg>
      </div>

      {/* Top fade blends into the section above, bottom fade under the footer */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-[1]"
        style={{ height: "200px", background: "linear-gradient(to bottom, black, transparent)" }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[1]"
        style={{ height: "120px", background: "linear-gradient(to top, black, transparent)" }}
      />

      {/* Content */}
      <div className="relative z-10">
        <h2 className="mx-auto mb-4 max-w-3xl font-heading text-5xl italic leading-[0.95] tracking-tight text-white [text-wrap:balance] md:text-6xl lg:text-7xl">
          Свободный интернет в&nbsp;одно касание
        </h2>
        <p className="mx-auto mb-8 max-w-xl font-body text-sm font-light text-white/60 md:text-base">
          Три дня бесплатно и без привязки карты. Ключ придёт в бот за пару секунд, подключение займёт минуту.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6">
          <a
            href="#plans"
            className="liquid-glass-strong flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 font-body text-sm font-medium text-white transition-all hover:bg-white/10 active:scale-[.97] sm:w-auto"
          >
            Смотреть тарифы
            <ArrowUpRight className="h-5 w-5" />
          </a>
          <a
            href={TRIAL_URL}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-white px-6 py-3 font-body text-sm font-medium text-black transition-colors hover:bg-white/90 active:scale-[.97] sm:w-auto"
          >
            Попробовать бесплатно
            <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>

        {/* Footer */}
        <footer className="mt-40 flex flex-col items-center justify-between gap-4 border-t border-white/10 py-8 md:mt-56 md:flex-row">
          <p className="font-body text-xs font-light text-white/40">© 2026 MERO VPN. Все права защищены.</p>
          <nav className="flex flex-wrap items-center justify-center gap-6" aria-label="Документы и поддержка">
            <button type="button" onClick={onPrivacy} className="font-body text-xs font-light text-white/40 transition-colors hover:text-white/70">
              Конфиденциальность
            </button>
            <button type="button" onClick={onTerms} className="font-body text-xs font-light text-white/40 transition-colors hover:text-white/70">
              Условия
            </button>
            <a href={SUPPORT_URL} className="font-body text-xs font-light text-white/40 transition-colors hover:text-white/70">
              Поддержка
            </a>
          </nav>
        </footer>
      </div>
    </section>
  );
};

export default CtaFooter;
