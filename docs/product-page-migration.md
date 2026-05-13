# Dynamic Product Page Workflow

Use this setup so new product pages come from Supabase data instead of manual HTML/JS duplication.

## Option 1 (No new HTML page each time)

Open a single reusable route:

`/pure-nickel-strip/product/?product=<slug>`

Example:

`/pure-nickel-strip/product/?product=32650/32700-H-Type-Nickel-Strips`

Add only a new row in `busbarproduct` table with a unique `slug` and section fields.

## Option 2 (Keep SEO-friendly static URLs)

Create a very small wrapper page and set only `data-product-slug`:

```html
<body data-product-slug="32650/32700-H-Type-Nickel-Strips">
  <div id="header__container"></div>
  <main>
    <div id="detailed_page"></div>
  </main>
  <div id="footer-container"></div>

  <script src="https://unpkg.com/@supabase/supabase-js@2"></script>
  <script src="/javascript/product-page-runtime.js"></script>
  <script type="module" src="/javascript/floating-form.js"></script>
  <script src="/javascript/detailed.js"></script>
</body>
```

No inline data-fetch script is needed anymore.

## Required DB fields

The runtime expects these content columns in `busbarproduct`:

- `slug`
- `flat-banner`
- `sidebar`
- `title`
- `toc`
- `introduction`
- `ss-content`
- `specification`
- `imageSection`
- `equivalent-grades`
- `product-grade`
- `chemical`
- `mechanical-properties`
- `uses`
- `search`
- `countries`
- `city`

Optional SEO columns (auto-applied if present):

- `meta_title` or `seo_title` or `page_title`
- `meta_description` or `seo_description`
- `meta_keywords` or `seo_keywords`
