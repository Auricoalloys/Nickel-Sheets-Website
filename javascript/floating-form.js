// floating-form.js - The reusable module
export class FloatingForm {
    constructor(config = {}) {
        this.config = {
            scriptUrl: "https://script.google.com/macros/s/AKfycbwzxL3Z3fxIWCnQO6EyEu1r3_QttTFE1uLkl3tx8QpCoGecyohNy1lK-mIHXlJFRwM9/exec",
            buttonText: "Request an Offer",
            formTitle: "Request an Offer",
            position: "bottom-left",
            ...config
        };
        
        this.isVisible = false;
        this.init();
    }
    
    init() {
        this.injectStyles();
        this.createElements();
        this.bindEvents();
    }
    
    injectStyles() {
        if (document.getElementById('floating-form-styles')) return;
        
        const styles = `
            .floating-form-button {
                position: fixed;
                ${this.config.position === 'bottom-left' ? 'left: 20px;' : 'right: 20px;'}
                bottom: 20px;
                background: linear-gradient(135deg, #fec163 0%, #e67e22 100%);
                color: white;
                border-radius: 50px;
                padding: 15px 20px;
                cursor: pointer;
                box-shadow: 0 4px 15px rgba(0,0,0,0.2);
                transition: all 0.3s ease;
                z-index: 9999;
                display: flex;
                align-items: center;
                gap: 10px;
                border: none;
                font-family: inherit;
                font-size: 16px;
            }
            
            .floating-form-button:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 20px rgba(0,0,0,0.3);
            }
            
            .floating-form-sidebar {
                position: fixed;
                top: 0;
                right: -400px;
                width: 400px;
                height: 100vh;
                background: white;
                box-shadow: -2px 0 10px rgba(0,0,0,0.1);
                transition: right 0.3s ease;
                z-index: 1001;
                padding: 30px;
                overflow-y: auto;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }
            
            .floating-form-sidebar.show {
                left: 0;
            }            
            .floating-form-close {
                position: absolute;
                top: 15px;
                right: 20px;
                font-size: 30px;
                cursor: pointer;
                color: #666;
                background: none;
                border: none;
                line-height: 1;
            }
            
            .floating-form-title {
                margin-bottom: 25px;
                color: #333;
                font-size: 24px;
                font-weight: 600;
            }
            
            .floating-form-group {
                margin-bottom: 15px;
            }
            
            .floating-form-label {
                display: block;
                margin-bottom: 5px;
                font-weight: 500;
                color: #555;
            }
            
            .floating-form-input,
            .floating-form-textarea {
                width: 100%;
                padding: 12px;
                border: 1px solid #ddd;
                border-radius: 4px;
                font-size: 14px;
                box-sizing: border-box;
                font-family: inherit;
            }
            
            .floating-form-textarea {
                resize: vertical;
                min-height: 100px;
            }
            
            .floating-form-checkbox-wrapper {
                margin: 15px 0;
            }
            
            .floating-form-checkbox-label {
                display: flex;
                align-items: flex-start;
                font-size: 12px;
                line-height: 1.4;
                cursor: pointer;
            }
            
            .floating-form-checkbox {
                margin-right: 8px;
                margin-top: 2px;
            }
            
            .floating-form-submit {
                width: 100%;
                padding: 12px;
                background: linear-gradient(135deg, #CFD8DC 0%, #455A64 100%);
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 16px;
                transition: opacity 0.3s;
                font-family: inherit;
            }
            
            .floating-form-submit:disabled {
                opacity: 0.6;
                cursor: not-allowed;
            }
            
            .floating-form-status {
                margin-top: 10px;
                padding: 10px;
                border-radius: 4px;
                text-align: center;
                font-size: 14px;
            }
            
            .floating-form-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.5);
                z-index: 1000;
                opacity: 0;
                visibility: hidden;
                transition: all 0.3s ease;
            }
            
            .floating-form-overlay.show {
                opacity: 1;
                visibility: visible;
            }
            
            @media (max-width: 768px) {
                .floating-form-sidebar {
                    width: 100%;
                    right: -100%;
                }
                
                .floating-form-button {
                    bottom: 15px;
                    right: 15px;
                    padding: 12px 16px;
                }
            }
        `;
        
        const styleSheet = document.createElement('style');
        styleSheet.id = 'floating-form-styles';
        styleSheet.textContent = styles;
        document.head.appendChild(styleSheet);
    }
    
    createElements() {
        // Create overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'floating-form-overlay';
        
        // Create floating button
        this.button = document.createElement('button');
        this.button.className = 'floating-form-button';
        this.button.innerHTML = `
            <i class="fas fa-comment-dots"></i>
            <span>${this.config.buttonText}</span>
        `;
        
        // Create sidebar
        this.sidebar = document.createElement('div');
        this.sidebar.className = 'floating-form-sidebar';
        this.sidebar.innerHTML = `
            <button class="floating-form-close">×</button>
            <h3 class="floating-form-title">${this.config.formTitle}</h3>
            <form class="floating-form-form">
                <div class="floating-form-group">
                    <label class="floating-form-label">Country*</label>
                    <input type="text" name="country" class="floating-form-input" required>
                </div>
                <div class="floating-form-group">
                    <label class="floating-form-label">Name*</label>
                    <input type="text" name="name" class="floating-form-input" required>
                </div>
                <div class="floating-form-group">
                    <label class="floating-form-label">Mobile Number*</label>
                    <input type="tel" name="phone" class="floating-form-input" required>
                </div>
                <div class="floating-form-group">
                    <label class="floating-form-label">E-Mail*</label>
                    <input type="email" name="email" class="floating-form-input" required>
                </div>
                <div class="floating-form-group">
                    <label class="floating-form-label">Inquiry*</label>
                    <textarea name="inquiry" rows="4" class="floating-form-textarea" required></textarea>
                </div>
                <div class="floating-form-checkbox-wrapper">
                    <label class="floating-form-checkbox-label">
                        <input type="checkbox" name="privacy" class="floating-form-checkbox" required>
                        I hereby accept the <a href="/privacy-policy" target="_blank">privacy policy</a> and I am
                        aware that I am using this form to send personal information!
                    </label>
                </div>
                <button type="submit" class="floating-form-submit">Submit Inquiry</button>
                <div class="floating-form-status"></div>
            </form>
        `;
        
        // Add to DOM
        document.body.appendChild(this.overlay);
        document.body.appendChild(this.button);
        document.body.appendChild(this.sidebar);
    }
    
    bindEvents() {
        const closeBtn = this.sidebar.querySelector('.floating-form-close');
        const form = this.sidebar.querySelector('.floating-form-form');
        
        this.button.addEventListener('click', () => this.toggle());
        closeBtn.addEventListener('click', () => this.close());
        this.overlay.addEventListener('click', () => this.close());
        form.addEventListener('submit', (e) => this.handleSubmit(e));
        
        // ESC key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isVisible) {
                this.close();
            }
        });
    }
    
    toggle() {
        if (this.isVisible) {
            this.close();
        } else {
            this.open();
        }
    }
    
    open() {
        this.isVisible = true;
        this.overlay.classList.add('show');
        this.sidebar.classList.add('show');
        document.body.style.overflow = 'hidden';
    }
    
    close() {
        this.isVisible = false;
        this.overlay.classList.remove('show');
        this.sidebar.classList.remove('show');
        document.body.style.overflow = '';
    }
    
    async handleSubmit(e) {
        e.preventDefault();
        
        const form = e.target;
        const submitBtn = form.querySelector('.floating-form-submit');
        const statusElement = form.querySelector('.floating-form-status');
        
        submitBtn.disabled = true;
        statusElement.textContent = 'Submitting...';
        statusElement.style.color = '#666';
        statusElement.style.background = '#f0f0f0';
        
        const formData = {
            country: form.country.value,
            name: form.name.value,
            phone: form.phone.value,
            email: form.email.value,
            inquiry: form.inquiry.value,
            privacy: form.privacy.checked ? 'Accepted' : 'Not Accepted',
            timestamp: new Date().toISOString(),
            page: window.location.pathname
        };
        
        try {
            await fetch(this.config.scriptUrl, {
                method: 'POST',
                body: JSON.stringify(formData),
                headers: {
                    'Content-Type': 'application/json'
                },
                mode: 'no-cors'
            });
            
            statusElement.textContent = 'Inquiry submitted successfully!';
            statusElement.style.color = 'white';
            statusElement.style.background = '#4CAF50';
            form.reset();
            
            setTimeout(() => {
                this.close();
            }, 2000);
            
        } catch (error) {
            console.error('Error:', error);
            statusElement.textContent = 'Error submitting inquiry. Please try again.';
            statusElement.style.color = 'white';
            statusElement.style.background = '#f44336';
        } finally {
            submitBtn.disabled = false;
        }
    }
    
    // Method to destroy the component
    destroy() {
        this.button.remove();
        this.sidebar.remove();
        this.overlay.remove();
        const styles = document.getElementById('floating-form-styles');
        if (styles) styles.remove();
    }
}
// Automatically initialize when loaded
document.addEventListener('DOMContentLoaded', () => {
    window.floatingForm = new FloatingForm();
});

