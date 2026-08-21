document.addEventListener('DOMContentLoaded', function () {
  const mobileToggle = document.querySelector('.mobile_menu_toggle');
  const navList = document.querySelector('.header__nav-list');

  if (mobileToggle && navList) {
    mobileToggle.addEventListener('click', function () {
      navList.classList.toggle('active');
      this.setAttribute('aria-expanded', navList.classList.contains('active'));
    });

    function handleResize() {
      if (window.innerWidth > 768) {
        navList.classList.remove('active');
        mobileToggle.setAttribute('aria-expanded', 'false');
      }
    }

    window.addEventListener('resize', handleResize);
    handleResize();
  }

  // The language switcher lived here. It is gone because there was never a
  // translation behind it: no page carries .language-selector markup or a
  // data-i18n attribute, translations.js is empty and no <lang>.json file was
  // ever written, so every fetch 404ed and no text changed. What it did do was
  // rewrite window.location.search to ?lang=xx, which put /index.html?lang=en,
  // ?lang=es and ?lang=hi into Google's index as three duplicates of the
  // English homepage. Search Console reported all three as "Crawled - currently
  // not indexed". Restore this only alongside real translated content and
  // hreflang tags; a switcher with nothing behind it only mints duplicate URLs.

  // Product marquee - only present on the homepage
  const slider = document.querySelector('.product-track');
  if (slider) {
    slider.addEventListener('mouseenter', () => {
      slider.style.animationPlayState = 'paused';
    });
    slider.addEventListener('mouseleave', () => {
      slider.style.animationPlayState = 'running';
    });
  }

  // Reveal feature cards on scroll
  const featureCards = document.querySelectorAll('.feature-card');
  if (featureCards.length) {
    if (!('IntersectionObserver' in window) ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      featureCards.forEach(card => card.classList.add('visible'));
    } else {
      const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            obs.unobserve(entry.target);
          }
        });
      }, { threshold: 0.5 });

      featureCards.forEach(card => observer.observe(card));
    }
  }
});
