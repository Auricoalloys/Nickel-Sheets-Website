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

  // Language Switcher
  const languageSelector = document.querySelector('.language-selector');
  const languageDropdown = document.querySelector('.language-dropdown');

  if (languageSelector && languageDropdown) {
    languageSelector.addEventListener('click', function (e) {
      e.preventDefault();
      languageDropdown.style.display =
        languageDropdown.style.display === 'block' ? 'none' : 'block';
    });

    document.addEventListener('click', function (e) {
      if (!languageSelector.contains(e.target)) {
        languageDropdown.style.display = 'none';
      }
    });

    document.querySelectorAll('.language-dropdown a').forEach(link => {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        const selectedLang = this.getAttribute('href').split('=')[1];
        window.location.search = `?lang=${selectedLang}`;
      });
    });

    loadTranslations(
      new URLSearchParams(window.location.search).get('lang') ||
      localStorage.getItem('selectedLanguage') ||
      'en'
    );
  }

  // Translations live at a fixed root path; a relative URL would resolve
  // against the current pretty URL and 404 on every nested page.
  function loadTranslations(lang) {
    fetch(`/javascript/translations/${lang}.json`)
      .then(response => (response.ok ? response.json() : null))
      .then(data => {
        if (!data) return;

        document.querySelectorAll('[data-i18n]').forEach(element => {
          const key = element.getAttribute('data-i18n');
          if (data[key]) element.textContent = data[key];
        });

        const langSelector = document.querySelector('.language-selector a');
        if (langSelector) {
          langSelector.innerHTML = `<i class="fas fa-globe"></i> ${lang.toUpperCase()}`;
        }

        localStorage.setItem('selectedLanguage', lang);
      })
      .catch(() => { /* translations are optional */ });
  }

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
