document.addEventListener('DOMContentLoaded', function() {
    const slides = document.querySelectorAll('.slide');
    const sliderContainer = document.querySelector('.slider-container');
    const prevButton = document.querySelector('.prev-slide');
    const nextButton = document.querySelector('.next-slide');
    const descriptionElement = document.querySelector('.slide-description');
    let currentIndex = 0;
    const intervalTime = 5000; // Time in milliseconds between slides

    function showSlide(index) {
        slides.forEach(slide => slide.classList.remove('active'));
        slides[index].classList.add('active');
        descriptionElement.textContent = slides[index].dataset.description;
    }

    function nextSlide() {
        currentIndex = (currentIndex + 1) % slides.length;
        showSlide(currentIndex);
    }

    function prevSlide() {
        currentIndex = (currentIndex - 1 + slides.length) % slides.length;
        showSlide(currentIndex);
    }

    // Automatic sliding
    let slideInterval = setInterval(nextSlide, intervalTime);

    // Event listeners for manual navigation
    // nextButton.addEventListener('click', () => {
    //     clearInterval(slideInterval); // Stop automatic sliding on manual navigation
    //     nextSlide();
    //     slideInterval = setInterval(nextSlide, intervalTime); // Restart automatic sliding
    // });

    // prevButton.addEventListener('click', () => {
    //     clearInterval(slideInterval);
    //     prevSlide();
    //     slideInterval = setInterval(nextSlide, intervalTime);
    // });

    // Initial display
    showSlide(currentIndex);
});
