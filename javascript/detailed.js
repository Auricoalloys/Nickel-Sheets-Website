document.addEventListener("click", function (e) {
  if (e.target.classList.contains("toggle-btn")) {
    const list = e.target.nextElementSibling;

    // Hide all other lists
    document.querySelectorAll(".link-list").forEach((el) => {
      if (el !== list) el.style.display = "none";
    });

    // Toggle current list
    list.style.display = list.style.display === "block" ? "none" : "block";
  }
});


  // === Smooth Scroll for Anchor Links ===
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
      e.preventDefault();
      const targetId = this.getAttribute("href").substring(1);
      const targetElement = document.getElementById(targetId);
      if (targetElement) {
        targetElement.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    });
  });

  // === Scroll-to-Top Button Visibility ===
  const scrollUpBtn = document.getElementById("scrollUpBtn");
  if (scrollUpBtn) {
    window.addEventListener("scroll", () => {
      if (window.scrollY > 200) {
        scrollUpBtn.style.display = "block";
      } else {
        scrollUpBtn.style.display = "none";
      }
    });

    // === Scroll to #introduction Section ===
    scrollUpBtn.addEventListener("click", () => {
      const introSection = document.getElementById("introduction");
      if (introSection) {
        introSection.scrollIntoView({ behavior: "smooth" });
      }
    });
  }
