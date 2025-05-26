function initInquiryFormListeners() {
  const closeBtn = document.getElementById("closeFormText");
  const floatingBtn = document.getElementById("floatingButton");
  const inquiryForm = document.getElementById("inquiryForm");

  if (!closeBtn || !floatingBtn || !inquiryForm) {
    console.warn("Form elements not found yet");
    return false; // Return false to indicate failure
  }

  closeBtn.addEventListener("click", function () {
    document.getElementById("formSidebar").style.display = "none";
  });

  floatingBtn.addEventListener("click", function () {
    const formSidebar = document.getElementById("formSidebar");
    formSidebar.style.display = formSidebar.style.display === "block" ? "none" : "block";
    this.classList.add("clicked");
  });

  inquiryForm.addEventListener("submit", function (e) {
    e.preventDefault();
    const form = e.target;
    const submitBtn = document.getElementById("submitBtn");
    const statusElement = document.getElementById("formStatus");

    submitBtn.disabled = true;
    statusElement.innerText = "Submitting...";
    statusElement.style.color = "inherit";

    const formData = {
      country: form.country.value,
      name: form.name.value,
      phone: form.phone.value,
      email: form.email.value,
      inquiry: form.inquiry.value,
      privacy: form.privacy.checked ? "Accepted" : "Not Accepted"
    };

    const scriptUrl = "https://script.google.com/macros/s/AKfycbwzxL3Z3fxIWCnQO6EyEu1r3_QttTFE1uLkl3tx8QpCoGecyohNy1lK-mIHXlJFRwM9/exec";

    fetch(scriptUrl, {
      method: "POST",
      body: JSON.stringify(formData),
      headers: {
        "Content-Type": "application/json"
      },
      mode: "no-cors"
    })
      .then(() => {
        statusElement.innerText = "Inquiry submitted successfully 1!";
        statusElement.style.color = "green";
        form.reset();
      })
      .catch((error) => {
        console.error("Error:", error);
        statusElement.innerText = "Error submitting inquiry. Please try again later.";
        statusElement.style.color = "red";
      })
      .finally(() => {
        submitBtn.disabled = false;
      });
  });

  return true; // Return true to indicate success
}

// Inject header, then attach events 
fetch("/html/header.html")
  .then((response) => response.text())
  .then((html) => {
    document.getElementById("header__container").innerHTML = html;

    // Wait a bit for DOM to settle, then try to initialize
    return new Promise(resolve => {
      setTimeout(() => {
        const success = initInquiryFormListeners();
        if (!success) {
          // If it failed, try a few more times
          let attempts = 0;
          const retryInterval = setInterval(() => {
            attempts++;
            if (initInquiryFormListeners() || attempts >= 5) {
              clearInterval(retryInterval);
              resolve();
            }
          }, 200);
        } else {
          resolve();
        }
      }, 100);
    });
  })
  .catch((error) => {
    console.error("Failed to load header:", error);
  });

// Inject footer 
fetch("/html/footer.html")
  .then((response) => response.text())
  .then((html) => {
    document.getElementById("footer-container").innerHTML = html;
  })
  .catch((error) => {
    console.error("Failed to load footer:", error);
  });