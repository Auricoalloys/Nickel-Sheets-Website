(() => {
  const SUPABASE_URL = "https://nnxiioeqroxutwwcqnpg.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ueGlpb2Vxcm94dXR3d2NxbnBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4NTc0NTMsImV4cCI6MjA2NDQzMzQ1M30.msCK7AQz4zmqauVSlWa6hpDWLGCkDRse7D4kxDPCVaw";
  const TABLE_NAME = "busbarproduct";

  const SECTION_KEYS = [
    "flat-banner",
    "sidebar",
    "title",
    "toc",
    "introduction",
    "ss-content",
    "specification",
    "imageSection",
    "equivalent-grades",
    "product-grade",
    "chemical",
    "mechanical-properties",
    "uses",
    "search",
    "countries",
    "city",
  ];

  let particleIntervalId = null;
  let progressIntervalId = null;

  function logError(message, error) {
    console.error(`[product-page-runtime] ${message}`, error || "");
  }

  function getProductSlug() {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get("product");
    if (fromQuery) return fromQuery;

    const fromBody = document.body?.dataset?.productSlug;
    if (fromBody) return fromBody;

    return "";
  }

  async function loadHtmlInto(selector, url) {
    const target = document.querySelector(selector);
    if (!target) return;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url} (${response.status})`);
    }

    target.innerHTML = await response.text();
  }

  function startLoadingEffects() {
    const overlay = document.getElementById("loading-overlay");
    if (!overlay) return;

    const colors = [
      "rgba(26, 82, 118, 0.6)",
      "rgba(44, 62, 80, 0.6)",
      "rgba(44, 62, 80, 0.6)",
    ];

    particleIntervalId = window.setInterval(() => {
      const particle = document.createElement("div");
      particle.classList.add("particle");

      const size = Math.random() * 8 + 4;
      particle.style.width = `${size}px`;
      particle.style.height = `${size}px`;
      particle.style.left = `${Math.random() * 100}vw`;
      particle.style.background = colors[Math.floor(Math.random() * colors.length)];
      particle.style.animationDuration = `${Math.random() * 6 + 4}s`;

      overlay.appendChild(particle);

      window.setTimeout(() => {
        particle.remove();
      }, 10000);
    }, 400);

    const progressBar = document.getElementById("progress-bar");
    if (!progressBar) return;

    let width = 0;
    progressIntervalId = window.setInterval(() => {
      if (width >= 95) {
        window.clearInterval(progressIntervalId);
        progressIntervalId = null;
        return;
      }

      width += Math.random() * 5;
      progressBar.style.width = `${Math.min(width, 95)}%`;
    }, 300);
  }

  function hideLoadingOverlay() {
    const overlay = document.getElementById("loading-overlay");
    const contentContainer = document.querySelector(".content-container");
    const progressBar = document.getElementById("progress-bar");

    if (particleIntervalId) {
      window.clearInterval(particleIntervalId);
      particleIntervalId = null;
    }

    if (progressIntervalId) {
      window.clearInterval(progressIntervalId);
      progressIntervalId = null;
    }

    if (progressBar) {
      progressBar.style.width = "100%";
    }

    if (overlay) {
      overlay.style.display = "none";
    }

    if (contentContainer) {
      contentContainer.style.display = "block";
    }
  }

  function applySectionHtml(data) {
    SECTION_KEYS.forEach((key) => {
      const target = document.getElementById(key);
      if (!target) return;
      target.innerHTML = data[key] || "";
    });
  }

  function applyMetaFromData(data) {
    const metaTitle = data.meta_title || data.seo_title || data.page_title;
    const metaDescription = data.meta_description || data.seo_description;
    const metaKeywords = data.meta_keywords || data.seo_keywords;

    if (metaTitle) {
      document.title = String(metaTitle).replace(/<[^>]*>/g, "").trim();
    }

    if (metaDescription) {
      const descriptionTag = document.querySelector('meta[name="description"]');
      if (descriptionTag) {
        descriptionTag.setAttribute("content", metaDescription);
      }
    }

    if (metaKeywords) {
      const keywordsTag = document.querySelector('meta[name="keywords"]');
      if (keywordsTag) {
        keywordsTag.setAttribute("content", metaKeywords);
      }
    }
  }

  async function fetchProductData(client, slug) {
    const { data, error } = await client
      .from(TABLE_NAME)
      .select("*")
      .eq("slug", slug)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error(`No product found for slug: ${slug}`);

    return data;
  }

  async function buildSupabaseClient() {
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      throw new Error("Supabase library not loaded.");
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error("Supabase URL or anon key is missing.");
    }

    return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  async function initProductPage() {
    const slug = getProductSlug();
    if (!slug) {
      logError(
        'Missing slug. Add ?product=<slug> in URL or set <body data-product-slug="...">.'
      );
      return;
    }

    try {
      await Promise.all([
        loadHtmlInto("#header__container", "/html/header.html"),
        loadHtmlInto("#footer-container", "/html/footer.html"),
        loadHtmlInto("#detailed_page", "/html/product_detailed_page.html"),
      ]);

      startLoadingEffects();

      const client = await buildSupabaseClient();
      const data = await fetchProductData(client, slug);

      applySectionHtml(data);
      applyMetaFromData(data);
    } catch (error) {
      logError("Product page load failed.", error);
    } finally {
      hideLoadingOverlay();
    }
  }

  document.addEventListener("DOMContentLoaded", initProductPage);
})();
