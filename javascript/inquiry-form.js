function initInquiryFormListeners() {
  const closeBtn = document.getElementById("closeFormText");
  const floatingBtn = document.getElementById("floatingButton");
  const inquiryForm = document.getElementById("inquiryForm");

  if (!closeBtn || !floatingBtn || !inquiryForm) {
    console.warn("Form elements not found yet");
    return false;
  }

  console.log("Initializing form listeners...");

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

    console.log("Form submitted!"); // Debug log

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

    console.log("Form data:", formData); // Debug log

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
        statusElement.innerText = "Inquiry submitted successfully!";
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

  console.log("Form listeners attached successfully!");
  return true;
}

// Function to continuously check for elements and initialize when found
function waitForFormElements() {
  const checkInterval = setInterval(() => {
    if (initInquiryFormListeners()) {
      clearInterval(checkInterval);
      console.log("Form initialization complete!");
    }
  }, 100); // Check every 100ms

  // Stop trying after 10 seconds
  setTimeout(() => {
    clearInterval(checkInterval);
    console.warn("Timeout: Form elements never appeared");
  }, 10000);
}

// Start checking for elements when this script loads
waitForFormElements();