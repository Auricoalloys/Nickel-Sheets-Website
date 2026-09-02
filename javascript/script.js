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

  // Product marquee - only present on the homepage. The track holds one set of
  // cards. For a gap-free loop a second copy has to scroll into view before the
  // first has fully left; without it the strip scrolled entirely off and snapped
  // back (the animation travelled -100%, the whole track width). Rather than
  // duplicate the twelve cards in the HTML - which would put every product title
  // in the crawlable markup twice - clone them here and mark the clones
  // aria-hidden and untabbable, so assistive tech and search engines still see
  // one set. The .is-cloned class then switches the animation to travel exactly
  // one copy's width (-50%). Skipped under reduced motion, where the CSS stops
  // the animation and a second copy would only add hidden DOM for nothing.
  const track = document.querySelector('.product-track');
  if (track) {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!reduceMotion) {
      Array.from(track.children).forEach((node) => {
        const clone = node.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        // The children are <a> card wrappers; take the clone and any nested
        // links out of the tab order so keyboard users do not traverse a
        // duplicate set (aria-hidden on a focusable element is invalid on its
        // own).
        clone.setAttribute('tabindex', '-1');
        clone.querySelectorAll('a').forEach((a) => a.setAttribute('tabindex', '-1'));
        track.appendChild(clone);
      });
      track.classList.add('is-cloned');
    }

    track.addEventListener('mouseenter', () => {
      track.style.animationPlayState = 'paused';
    });
    track.addEventListener('mouseleave', () => {
      track.style.animationPlayState = 'running';
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
