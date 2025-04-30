document.addEventListener('DOMContentLoaded', function () {
    const slides = document.querySelectorAll('.slide');
    const sliderContainer = document.querySelector('.slider-container');
    const descriptionElement = document.querySelector('.slide-description');
    let currentIndex = 0;
    const intervalTime = 5000; // Time in milliseconds between slides

    // Function to show a slide
    function showSlide(index) {
        slides.forEach(slide => slide.classList.remove('active'));
        slides[index].classList.add('active');

        // Update description text
        descriptionElement.textContent = slides[index].dataset.description;

        // Restart animation on description
        descriptionElement.classList.remove('animate-description');
        void descriptionElement.offsetWidth; // Trigger reflow
        descriptionElement.classList.add('animate-description');
    }

    // Function to go to next slide
    function nextSlide() {
        currentIndex = (currentIndex + 1) % slides.length;
        showSlide(currentIndex);
    }

    // Function to go to previous slide
    function prevSlide() {
        currentIndex = (currentIndex - 1 + slides.length) % slides.length;
        showSlide(currentIndex);
    }

    // Auto-slide
    let slideInterval = setInterval(nextSlide, intervalTime);

    // Add left/right click listener on slider container
    sliderContainer.addEventListener('click', function (event) {
        const clickX = event.clientX;
        const screenWidth = window.innerWidth;

        if (clickX < screenWidth / 2) {
            prevSlide(); // Left side click
        } else {
            nextSlide(); // Right side click
        }

        // Reset interval on manual navigation
        clearInterval(slideInterval);
        slideInterval = setInterval(nextSlide, intervalTime);
    });

    // Initial display
    showSlide(currentIndex);
});
