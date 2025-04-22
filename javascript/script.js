document.addEventListener('DOMContentLoaded', function() {
    // Mobile Menu Toggle (for responsive design)
    const mobile_menu_toggle = document.querySelector('header .container .mobile-menu-toggle');
    const navUl = document.querySelector('nav ul'); // Target the <ul> for toggling

    if (mobile_menu_toggle && navUl) {
        mobile_menu_toggle.addEventListener('click', function() {
            navUl.classList.toggle('active');
            this.setAttribute('aria-expanded', navUl.classList.contains('active')); // Update aria-expanded
        });
    } else {
        console.error("Mobile toggle or navigation UL element not found!");
    }

    function handleResize() {
        if (window.innerWidth > 768) {
            navUl.classList.remove('active'); // Ensure it's hidden on larger screens
            if (mobile_menu_toggle) {
                mobile_menu_toggle.setAttribute('aria-expanded', 'false');
            }
        }
    }

    window.addEventListener('resize', handleResize);
    handleResize();

    // Hide nav on larger screens
    function handleResize() {
        if (window.innerWidth > 768) {
            if (nav) {
                nav.classList.remove('active'); // Ensure it's not active on larger screens
            }
            if (mobile_menu_toggle) {
                mobile_menu_toggle.setAttribute('aria-expanded', 'false'); // Reset aria-expanded
            }
        }
    }

    window.addEventListener('resize', handleResize);
    handleResize(); // Call on initial load to apply proper state
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