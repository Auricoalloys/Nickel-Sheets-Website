document.addEventListener('DOMContentLoaded', function () {
    const mobileToggle = document.querySelector('.mobile_menu_toggle');
    const navList = document.querySelector('.header__nav-list');
  
    if (mobileToggle && navList) {
      mobileToggle.addEventListener('click', function () {
        navList.classList.toggle('active');
        const isActive = navList.classList.contains('active');
        this.setAttribute('aria-expanded', isActive);
      });
    }
  
    function handleResize() {
      if (window.innerWidth > 768) {
        navList.classList.remove('active');
        mobileToggle.setAttribute('aria-expanded', 'false');
      }
    }
  
    window.addEventListener('resize', handleResize);
    handleResize(); // Run on page load
  });

    // Language Switcher Functionality
    const languageSelector = document.querySelector('.language-selector');
    const languageDropdown = document.querySelector('.language-dropdown');

    if (languageSelector) {
        languageSelector.addEventListener('click', function(e) {
            e.preventDefault();
            languageDropdown.style.display = languageDropdown.style.display === 'block' ? 'none' : 'block';
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', function(e) {
            if (!languageSelector.contains(e.target)) {
                languageDropdown.style.display = 'none';
            }
        });
    }

    // Load translations based on selected language
    function loadTranslations(lang) {
        fetch(`translations/${lang}.json`)
            .then(response => response.json())
            .then(data => {
                // Apply translations to all elements with data-i18n attribute
                document.querySelectorAll('[data-i18n]').forEach(element => {
                    const key = element.getAttribute('data-i18n');
                    if (data[key]) {
                        element.textContent = data[key];
                    }
                });

                // Update active language in selector
                const langSelector = document.querySelector('.language-selector a');
                if (langSelector) {
                    langSelector.innerHTML = `<i class="fas fa-globe"></i> ${lang.toUpperCase()}`;
                }

                // Store selected language in localStorage
                localStorage.setItem('selectedLanguage', lang);
            })
            .catch(error => console.error('Error loading translations:', error));
    }

    // Check for language in URL or localStorage
    const urlParams = new URLSearchParams(window.location.search);
    const urlLang = urlParams.get('lang');
    const storedLang = localStorage.getItem('selectedLanguage');
    const defaultLang = 'en';

    const currentLang = urlLang || storedLang || defaultLang;
    loadTranslations(currentLang);

    // Handle language selection
    document.querySelectorAll('.language-dropdown a').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const selectedLang = this.getAttribute('href').split('=')[1];
            window.location.search = `?lang=${selectedLang}`;
        });
    });

// Product track animation

const slider = document.querySelector(".product-track");

slider.addEventListener("mouseenter", () => {
    slider.style.animationPlayState = "paused";
});

slider.addEventListener("mouseleave", () => {
    slider.style.animationPlayState = "running";
});

    // Feature Card Animation - Trigger visibility on scroll (Intersection Observer)
    document.addEventListener('DOMContentLoaded', function(){
    const featureCards = document.querySelectorAll('.feature-card');

    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target); // Stop observing once it's animated
            }
        });
    }, {
        threshold: 0.5 // Trigger when 50% of the card is visible
    });

    featureCards.forEach(card => {
        observer.observe(card);
    });
})
 document.addEventListener("DOMContentLoaded", function(){
  const cards = document.querySelectorAll('.vmgv-card');
  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if(entry.isIntersecting){
        entry.target.classList.add('visible');
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.2 });
  cards.forEach(card => observer.observe(card));
});
document.addEventListener("DOMContentLoaded", function(){
  const sections = document.querySelectorAll('.company-overview .row');
  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if(entry.isIntersecting){
        entry.target.classList.add('animate__animated', 'animate__fadeInUp');
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.2 });
  sections.forEach(sec => observer.observe(sec));
});