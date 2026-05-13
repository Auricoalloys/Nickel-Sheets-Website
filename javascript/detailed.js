document.addEventListener("click", function (e) {
  const toggleBtn = e.target.closest(".toggle-btn");
  if (toggleBtn) {
    const list = toggleBtn.nextElementSibling;
    if (!list) return;

    document.querySelectorAll(".link-list").forEach((el) => {
      if (el !== list) el.style.display = "none";
    });

    list.style.display = list.style.display === "block" ? "none" : "block";
    return;
  }

  const anchor = e.target.closest('a[href^="#"]');
  if (anchor) {
    const targetId = anchor.getAttribute("href")?.substring(1);
    if (!targetId) return;

    const targetElement = document.getElementById(targetId);
    if (!targetElement) return;

    e.preventDefault();
    targetElement.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }
});

window.addEventListener("scroll", () => {
  const scrollUpBtn = document.getElementById("scrollUpBtn");
  if (!scrollUpBtn) return;

  scrollUpBtn.style.display = window.scrollY > 200 ? "block" : "none";
});

document.addEventListener("click", (e) => {
  const scrollUpBtn = e.target.closest("#scrollUpBtn");
  if (!scrollUpBtn) return;

  const introSection = document.getElementById("introduction");
  if (introSection) {
    introSection.scrollIntoView({ behavior: "smooth" });
  }
});
