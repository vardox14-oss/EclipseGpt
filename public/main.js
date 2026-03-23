/* ============================================
   ECLIPSEGPT - MAIN JAVASCRIPT
   Scroll Reveal + Ember Particles + Smooth Scroll
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
    initNavbar();
    initScrollReveal();
    initEmberParticles();
    initSmoothScroll();
});

/* ---- Navbar scroll effect ---- */
function initNavbar() {
    const navbar = document.getElementById('navbar');
    window.addEventListener('scroll', () => {
        if (window.pageYOffset > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });
}

/* ---- Scroll Reveal System ---- */
function initScrollReveal() {
    const revealElements = document.querySelectorAll('[data-reveal]');

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const delay = entry.target.dataset.revealDelay || 0;
                setTimeout(() => {
                    entry.target.classList.add('revealed');
                }, parseInt(delay));
                observer.unobserve(entry.target); // Only animate once
            }
        });
    }, {
        threshold: 0.12,
        rootMargin: '0px 0px -60px 0px'
    });

    revealElements.forEach(el => observer.observe(el));
}

/* ---- Ember / Fire Particles ---- */
function initEmberParticles() {
    const canvas = document.getElementById('emberCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let embers = [];
    const EMBER_COUNT = 45;

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = document.documentElement.scrollHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    // Recalculate canvas height periodically (for dynamic content)
    setInterval(resize, 3000);

    class Ember {
        constructor() {
            this.reset();
        }

        reset() {
            this.x = Math.random() * canvas.width;
            this.y = canvas.height + Math.random() * 100;
            this.size = Math.random() * 3 + 1;
            this.speedY = -(Math.random() * 1.2 + 0.3);
            this.speedX = (Math.random() - 0.5) * 0.8;
            this.opacity = Math.random() * 0.6 + 0.2;
            this.fadeSpeed = Math.random() * 0.003 + 0.001;
            this.wobble = Math.random() * Math.PI * 2;
            this.wobbleSpeed = Math.random() * 0.03 + 0.01;
            // Color: random warm tone (red to orange to yellow)
            const hue = Math.random() * 40 + 5; // 5-45 (red to orange)
            const sat = 90 + Math.random() * 10;
            const light = 45 + Math.random() * 20;
            this.color = `hsl(${hue}, ${sat}%, ${light}%)`;
        }

        update() {
            this.wobble += this.wobbleSpeed;
            this.x += this.speedX + Math.sin(this.wobble) * 0.3;
            this.y += this.speedY;
            this.opacity -= this.fadeSpeed;

            if (this.opacity <= 0 || this.y < -20) {
                this.reset();
            }
        }

        draw() {
            ctx.save();
            ctx.globalAlpha = this.opacity;

            // Glow effect
            ctx.shadowBlur = this.size * 4;
            ctx.shadowColor = this.color;

            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    // Create embers
    for (let i = 0; i < EMBER_COUNT; i++) {
        const e = new Ember();
        e.y = Math.random() * canvas.height; // Spread across entire page initially
        embers.push(e);
    }

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        embers.forEach(ember => {
            ember.update();
            ember.draw();
        });
        requestAnimationFrame(animate);
    }

    animate();
}

/* ---- Smooth Scroll ---- */
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}
