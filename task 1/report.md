# Leaderboard task — approach

## Goal

Build a static replica of an internal leaderboard UI (header, filters, top-three podium, full list with activity metrics and expandable score breakdown), using **only synthetic data** (no real names, titles, departments, or corporate photos), and deploy it to **GitHub Pages**.

## Tools and stack

- **Vite + React + TypeScript** — fast local dev, a single production bundle suitable for static hosting.
- **Tailwind CSS v4** with the **@tailwindcss/vite** plugin — utility-first styling aligned with the reference layouts (cards, podium, spacing, accent blues).
- **lucide-react** — chevrons, star, search, crown, presentation and graduation-cap icons for parity with the reference UI.

## Layout and behaviour

- **Header** — title, subtitle, and a filter card with three native `<select>` controls and a search field.
- **Filtering / sorting** — client-side filter on synthetic `year`, `quarter`, and `category` fields plus case-insensitive name search; results are sorted by `totalScore` descending and **ranks are recomputed** after each filter change.
- **Podium** — renders places **2–1–3** (left to right) with height, colour, watermark digit, crown on first place, score pill, name, synthetic role line, and abstract avatar.
- **List** — every ranked row shows rank, avatar, name, role, activity counts (training when non-zero, then presentation-style count), total with star, and an expand control. Expanded panels list **neutral breakdown labels** and points; totals match the sum of breakdown lines in the seed data.

## Data replacement (responsible / no PII)

- **Names and roles** — hand-written fictional combinations in `leaderboard/src/data/employees.ts` (job titles only, no org codes).
- **Portraits** — **DiceBear** (`avataaars`) SVG URLs keyed by `avatarSeed`, so images are generative illustrations, not employee photos.
- **No original leaderboard export** was imported or pasted into prompts or tools; everything was authored for the demo.

## GitHub Pages

- Production `base` URL is set at build time via **`VITE_BASE_PATH`** (in CI: `/${{ github.event.repository.name }}/`) so asset URLs resolve under `https://<owner>.github.io/<repo>/`.
- **GitHub Actions** (`.github/workflows/pages.yml`) runs `npm ci` and `npm run build` in `leaderboard/`, uploads `dist` with `actions/upload-pages-artifact`, and deploys with `actions/deploy-pages`. Repository **Settings → Pages** should use **GitHub Actions** as the source.

## Local development

```bash
cd leaderboard
npm install
npm run dev
```

Build preview (root base):

```bash
npm run build && npm run preview
```
