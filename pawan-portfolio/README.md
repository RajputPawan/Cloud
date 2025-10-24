# Pawan Rajput — Portfolio (MkDocs Material)

A professional portfolio built with Python using MkDocs + Material theme. Deployed automatically to GitHub Pages via Actions.

## Local development

```bash
# From repo root
pip install -r Cloud/pawan-portfolio/requirements.txt
cd Cloud/pawan-portfolio
mkdocs serve
```

Open http://127.0.0.1:8000

## Build

```bash
cd Cloud/pawan-portfolio
mkdocs build --strict
```

Output is generated into `site/`.

## Deploy (GitHub Actions)

- Push to `main` to trigger the workflow `.github/workflows/pages.yml`.
- First time: enable GitHub Pages in repo Settings → Pages → Source: GitHub Actions.

## Customize

- Update `mkdocs.yml`:
  - `site_url`, `site_description`
  - colors (palette), fonts
  - social links under `extra.social`
- Add/edit content under `docs/` pages.
- To add a custom domain, create `CNAME` file under `docs/` or configure Pages settings.
