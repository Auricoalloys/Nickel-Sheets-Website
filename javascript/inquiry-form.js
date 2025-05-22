document.getElementById("closeFormText").addEventListener("click", function () {
  document.getElementById("formSidebar").style.display = "none";
});
document.getElementById("floatingButton").addEventListener("click", function () {
  const formSidebar = document.getElementById("formSidebar");
  formSidebar.style.display = formSidebar.style.display === "block" ? "none" : "block";
  this.classList.add("clicked");
});

document.getElementById("inquiryForm").addEventListener("submit", function (e) {
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
    email: form.email.value,
    inquiry: form.inquiry.value,
    privacy: form.privacy.checked ? "Accepted" : "Not Accepted"
  };

  // Make sure this is your NEW deployment URL
  const scriptUrl = "https://script.google.com/macros/s/AKfycbx5qgBmVotZ-ndhF8FsRPojrBitXqDBoGMQpw6w3n_lkoUrrLIr5rchmPY4ddh0RHZ-/exec";

  fetch(scriptUrl, {
    method: "POST",
    body: JSON.stringify(formData),
    headers: {
      "Content-Type": "application/json"
    },
    mode: 'no-cors'
  })
    .then(response => {
      // With no-cors mode, we can't read the response directly
      statusElement.innerText = "Inquiry submitted successfully!";
      statusElement.style.color = "green";
      form.reset();
    })
    .catch(error => {
      console.error("Error:", error);
      statusElement.innerText = "Error submitting inquiry. Please try again later.";
      statusElement.style.color = "red";
    })
    .finally(() => {
      submitBtn.disabled = false;
    });
});

// JavaScript to fetch and insert header (if you haven't already)
fetch('/html/header.html')
  .then(response => response.text())
  .then(html => {
    document.getElementById('header__container').innerHTML = html;
  })
  .catch(error => {
    console.error('Failed to load header:', error);
  });

// JavaScript to fetch and insert footer
fetch('/html/footer.html')
  .then(response => response.text())
  .then(html => {
    document.getElementById('footer-container').innerHTML = html;
  })
  .catch(error => {
    console.error('Failed to load footer:', error);
  });


document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener("click", function (e) {
      e.preventDefault();
      const targetId = this.getAttribute("href").substring(1);
      const targetElement = document.getElementById(targetId);
      if (targetElement) {
        targetElement.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      }
    });
  });
});


// Show button when scrolling down
window.onscroll = function () {
  const btn = document.getElementById("scrollUpBtn");
  if (document.body.scrollTop > 200 || document.documentElement.scrollTop > 200) {
    btn.style.display = "block";
  } else {
    btn.style.display = "none";
  }
};

// Scroll to the #introduction section
document.getElementById("scrollUpBtn").addEventListener("click", function () {
  document.querySelector("#introduction").scrollIntoView({
    behavior: "smooth"
  });
});