# CtaFooter (React + Vite + Tailwind)

Финальная секция MERO VPN: CTA и футер на фоне «горизонта планеты».
Вместо HLS-видео используется статичный SVG: никакой сети, декодирования и `hls.js`, на слабых телефонах не лагает.

## Зависимости

```bash
npm install lucide-react
```

## Шрифты

Instrument Serif и Barlow не поддерживают кириллицу, поэтому используются Cormorant italic (заголовок) и Geist (текст).
В `index.html` в `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant:ital,wght@1,400..600&family=Geist:wght@300..600&display=swap" rel="stylesheet">
```

## tailwind.config.ts

```ts
theme: {
  extend: {
    fontFamily: {
      heading: ["'Cormorant'", "Georgia", "serif"],
      body: ["'Geist'", "system-ui", "sans-serif"],
    },
  },
},
```

## index.css

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  font-family: 'Geist', system-ui, sans-serif;
  background: #000;
  color: #fff;
}
h1, h2, h3 {
  font-family: 'Cormorant', Georgia, serif;
}

@layer components {
  /* «Жидкое стекло» без backdrop-filter: размытие 50px на мобильных дорогое,
     а под кнопкой статичный фон, так что визуально разницы нет. */
  .liquid-glass-strong {
    background-color: rgba(255, 255, 255, 0.04);
    background-image: linear-gradient(180deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0) 60%);
    box-shadow: 4px 4px 4px rgba(0, 0, 0, 0.05), inset 0 1px 1px rgba(255, 255, 255, 0.15);
    position: relative;
    overflow: hidden;
  }
  .liquid-glass-strong::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    padding: 1.4px;
    background: linear-gradient(180deg,
      rgba(255, 255, 255, 0.5) 0%, rgba(255, 255, 255, 0.2) 20%,
      rgba(255, 255, 255, 0) 40%, rgba(255, 255, 255, 0) 60%,
      rgba(255, 255, 255, 0.2) 80%, rgba(255, 255, 255, 0.5) 100%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    pointer-events: none;
  }

  /* горизонт: дыхание ободка и пинги серверов, только opacity/transform */
  .cta-finale .hz-live { opacity: .65; animation: hz-breathe 7s ease-in-out infinite; will-change: opacity; }
  .cta-finale .hz-ping {
    fill: none; stroke: #4cc4ea; stroke-width: 1.2;
    transform-box: fill-box; transform-origin: center;
    animation: hz-ping 3.6s ease-out infinite;
    animation-delay: calc(var(--k) * -0.36s);
  }
  .cta-finale:not(.is-live) .hz-live,
  .cta-finale:not(.is-live) .hz-ping { animation-play-state: paused; }
}

@keyframes hz-breathe { 0%, 100% { opacity: .55 } 50% { opacity: 1 } }
@keyframes hz-ping { 0% { transform: scale(.4); opacity: .9 } 70%, 100% { transform: scale(2.2); opacity: 0 } }

@media (prefers-reduced-motion: reduce) {
  .cta-finale .hz-live, .cta-finale .hz-ping { animation: none; }
}
```

## Использование

```tsx
<div className="bg-black">
  {/* ...секции выше... */}
  <CtaFooter onPrivacy={() => setSheet('privacy')} onTerms={() => setSheet('terms')} />
</div>
```
