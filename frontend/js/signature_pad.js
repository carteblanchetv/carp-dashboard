// signature_pad.js - Shared Dual-Mode (Draw & Type) Signature Pad for CARP Forms

// Preload Priestacy (Producer) and Amsterdam (Co-Signer) fonts so Canvas and DOM render them immediately
if (typeof document !== 'undefined') {
    if (typeof FontFace !== 'undefined') {
        try {
            const priestacyFace = new FontFace('Priestacy', 'url(fonts/priestacy.otf)', {
                style: 'normal',
                weight: 'normal'
            });
            priestacyFace.load().then(loadedFace => {
                document.fonts.add(loadedFace);
            }).catch(e => console.warn('Priestacy font load notice:', e));

            const amsterdamFace = new FontFace('Amsterdam', 'url(fonts/amsterdam.ttf)', {
                style: 'normal',
                weight: 'normal'
            });
            amsterdamFace.load().then(loadedFace => {
                document.fonts.add(loadedFace);
            }).catch(e => console.warn('Amsterdam font load notice:', e));
        } catch (e) {}
    }
    if (document.fonts && document.fonts.load) {
        document.fonts.load('60px "Priestacy"');
        document.fonts.load('54px "Amsterdam"');
        document.fonts.load('60px "Birthstone Bounce"');
        document.fonts.load('60px "Herr Von Muellerhoff"');
        document.fonts.load('60px "Alex Brush"');
    }
}

class DualSignaturePad {
    static FONTS = {
        PRODUCER: '"Priestacy", "Birthstone Bounce", "Herr Von Muellerhoff", "Alex Brush", cursive',
        CO_SIGNER: '"Amsterdam", "Amsterdam Handwriting", "Birthstone Bounce", "Great Vibes", cursive'
    };

    constructor(container, options = {}) {
        this.container = typeof container === 'string' ? document.querySelector(container) : container;
        if (!this.container) return;

        const isProducer = (this.container && this.container.id && this.container.id.toLowerCase().includes('producer')) ||
                           (options && options.role === 'producer');
        const defaultFont = isProducer ? DualSignaturePad.FONTS.PRODUCER : DualSignaturePad.FONTS.CO_SIGNER;

        this.options = Object.assign({
            nameSourceId: null, // ID of input to copy name from (e.g. 'participantName')
            strokeColor: '#0f172a',
            fontFamily: defaultFont
        }, options);

        this.mode = 'draw'; // 'draw' or 'type'
        this.hasDrawn = false;
        this.typedText = '';
        this.isDrawing = false;
        this.isCanvasInitialized = false;

        // Elements
        this.tabDraw = this.container.querySelector('[data-mode="draw"]');
        this.tabType = this.container.querySelector('[data-mode="type"]');
        this.drawArea = this.container.querySelector('.sig-draw-area');
        this.typeArea = this.container.querySelector('.sig-type-area');
        this.canvas = this.container.querySelector('canvas');
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        this.placeholder = this.container.querySelector('.sig-canvas-placeholder');
        this.typeInput = this.container.querySelector('.sig-type-input');
        this.typePreview = this.container.querySelector('.sig-type-preview');
        this.clearBtn = this.container.querySelector('.btn-clear-sig');

        this.initCanvas();
        this.bindEvents();
    }

    initCanvas(force = false) {
        if (!this.canvas || !this.ctx) return;
        const rect = this.canvas.parentElement ? this.canvas.parentElement.getBoundingClientRect() : null;
        if (!rect || (rect.width === 0 && !force)) return;

        const dpr = window.devicePixelRatio || 1;
        const targetW = Math.round((rect.width || 320) * dpr);
        const targetH = Math.round((rect.height || 140) * dpr);

        if (!this.isCanvasInitialized || this.canvas.width !== targetW || this.canvas.height !== targetH) {
            let temp = null;
            if (this.hasDrawn) {
                temp = this.canvas.toDataURL();
            }

            this.canvas.width = targetW;
            this.canvas.height = targetH;
            this.canvas.style.touchAction = 'none';
            this.ctx.scale(dpr, dpr);
            this.ctx.lineWidth = 2.4;
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            this.ctx.strokeStyle = this.options.strokeColor;
            this.isCanvasInitialized = true;

            if (temp) {
                const img = new Image();
                img.src = temp;
                img.onload = () => {
                    this.ctx.drawImage(img, 0, 0, targetW / dpr, targetH / dpr);
                };
            }
        }
    }

    bindEvents() {
        // Tab switching
        if (this.tabDraw) {
            this.tabDraw.addEventListener('click', () => this.setMode('draw'));
        }
        if (this.tabType) {
            this.tabType.addEventListener('click', () => {
                this.setMode('type');
                // Pre-fill from name input if empty
                if (this.options.nameSourceId && !this.typedText) {
                    const sourceEl = document.getElementById(this.options.nameSourceId);
                    if (sourceEl && sourceEl.value.trim()) {
                        this.typeInput.value = sourceEl.value.trim();
                        this.updateTypedPreview();
                    }
                }
                if (this.typeInput) this.typeInput.focus();
            });
        }

        // Clear button
        if (this.clearBtn) {
            this.clearBtn.addEventListener('click', () => this.clear());
        }

        // Type input typing
        if (this.typeInput) {
            this.typeInput.addEventListener('input', () => this.updateTypedPreview());
        }

        // Canvas drawing (supports Mouse, Touch, and Windows Ink / Stylus Pointer events)
        if (this.canvas) {
            this.canvas.style.touchAction = 'none';
            const getPos = (e) => {
                const rect = this.canvas.getBoundingClientRect();
                const clientX = (e.touches && e.touches.length > 0) ? e.touches[0].clientX : e.clientX;
                const clientY = (e.touches && e.touches.length > 0) ? e.touches[0].clientY : e.clientY;
                return {
                    x: clientX - rect.left,
                    y: clientY - rect.top
                };
            };

            const start = (e) => {
                if (this.isLocked) return;
                if (e.button !== undefined && e.button !== 0) return;
                e.preventDefault();
                this.initCanvas();
                this.isDrawing = true;
                this.hasDrawn = true;
                if (this.placeholder) this.placeholder.style.display = 'none';
                const pos = getPos(e);
                this.ctx.beginPath();
                this.ctx.moveTo(pos.x, pos.y);
                this.ctx.lineTo(pos.x, pos.y);
                this.ctx.stroke();
            };

            const move = (e) => {
                if (!this.isDrawing || this.isLocked) return;
                e.preventDefault();
                const pos = getPos(e);
                this.ctx.lineTo(pos.x, pos.y);
                this.ctx.stroke();
            };

            const stop = (e) => {
                if (this.isDrawing) {
                    if (e && e.cancelable) e.preventDefault();
                    this.isDrawing = false;
                }
            };

            if (window.PointerEvent) {
                this.canvas.addEventListener('pointerdown', start);
                this.canvas.addEventListener('pointermove', move);
                window.addEventListener('pointerup', stop);
                window.addEventListener('pointercancel', stop);
            } else {
                this.canvas.addEventListener('mousedown', start);
                this.canvas.addEventListener('mousemove', move);
                window.addEventListener('mouseup', stop);

                this.canvas.addEventListener('touchstart', start, { passive: false });
                this.canvas.addEventListener('touchmove', move, { passive: false });
                window.addEventListener('touchend', stop);
            }

            window.addEventListener('resize', () => {
                if (this.mode === 'draw') {
                    this.initCanvas();
                }
            });
        }
    }

    setMode(mode) {
        this.mode = mode;
        if (mode === 'draw') {
            if (this.tabDraw) this.tabDraw.classList.add('active');
            if (this.tabType) this.tabType.classList.remove('active');
            if (this.drawArea) this.drawArea.classList.remove('hidden');
            if (this.typeArea) this.typeArea.classList.add('hidden');
            setTimeout(() => this.initCanvas(), 30);
        } else {
            if (this.tabType) this.tabType.classList.add('active');
            if (this.tabDraw) this.tabDraw.classList.remove('active');
            if (this.typeArea) this.typeArea.classList.remove('hidden');
            if (this.drawArea) this.drawArea.classList.add('hidden');
        }
    }

    updateTypedPreview() {
        if (!this.typeInput) return;
        this.typedText = this.typeInput.value;
        if (this.typePreview) {
            if (this.typedText.trim()) {
                this.typePreview.textContent = this.typedText;
                this.typePreview.style.fontFamily = this.options.fontFamily;
                this.typePreview.style.fontStyle = 'normal';
                this.typePreview.style.fontWeight = '400';
                this.typePreview.style.transform = 'none';
                this.typePreview.style.opacity = '1';
            } else {
                this.typePreview.textContent = 'Signature Preview';
                this.typePreview.style.fontStyle = 'normal';
                this.typePreview.style.transform = 'none';
                this.typePreview.style.opacity = '0.35';
            }
        }
    }

    clear() {
        if (this.isLocked) return;
        this.savedDataUrl = null;
        if (this.mode === 'draw') {
            if (this.ctx && this.canvas) {
                this.ctx.save();
                this.ctx.setTransform(1, 0, 0, 1, 0, 0);
                this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                this.ctx.restore();
            }
            this.hasDrawn = false;
            if (this.placeholder) this.placeholder.style.display = 'block';
        } else {
            if (this.typeInput) this.typeInput.value = '';
            this.typedText = '';
            this.updateTypedPreview();
        }
    }

    isEmpty() {
        if (this.savedDataUrl) return false;
        if (this.mode === 'draw') {
            return !this.hasDrawn;
        } else {
            return !this.typedText || !this.typedText.trim();
        }
    }

    /**
     * Automatically converts a typed full name from the form into a cursive typed signature
     * when the user clicks Submit without having drawn on the canvas.
     */
    autoSignFromName(fallbackName = '') {
        if (!this.isEmpty() || this.isLocked) return !this.isEmpty();
        let candidate = (fallbackName || '').trim();
        if (!candidate && this.options.nameSourceId) {
            const el = document.getElementById(this.options.nameSourceId);
            if (el && el.value) candidate = el.value.trim();
        }
        if (!candidate) return false;
        this.setMode('type');
        if (this.typeInput) {
            this.typeInput.value = candidate;
        }
        this.typedText = candidate;
        this.updateTypedPreview();
        return true;
    }

    loadDataURL(dataUrl, signerName = '') {
        if (!dataUrl && !signerName) return;
        this.setMode('draw');
        this.hasDrawn = true;

        if (!dataUrl && signerName) {
            dataUrl = DualSignaturePad.generateTypedDataURL(signerName, this.options.fontFamily, this.options.strokeColor);
        }

        // Auto-upgrade legacy chunky/comic typed signatures if signerName is available
        if (signerName && dataUrl && (dataUrl.length === 6742 || dataUrl.length === 6740 || dataUrl.length === 6744 || (dataUrl.length < 8000 && !dataUrl.startsWith('data:image/svg')))) {
            const neatUrl = DualSignaturePad.generateTypedDataURL(signerName, this.options.fontFamily, this.options.strokeColor);
            if (neatUrl) {
                dataUrl = neatUrl;
            }
        }

        this.savedDataUrl = dataUrl;

        const render = () => {
            if (!this.canvas || !this.ctx) return;
            const rect = this.canvas.parentElement ? this.canvas.parentElement.getBoundingClientRect() : null;
            const dpr = window.devicePixelRatio || 1;
            const w = (rect && rect.width > 0) ? rect.width : (this.canvas.width / dpr || 320);
            const h = (rect && rect.height > 0) ? rect.height : (this.canvas.height / dpr || 140);
            
            this.canvas.width = Math.round(w * dpr);
            this.canvas.height = Math.round(h * dpr);
            this.ctx.setTransform(1, 0, 0, 1, 0, 0);
            this.ctx.scale(dpr, dpr);
            this.ctx.clearRect(0, 0, w, h);

            const img = new Image();
            img.onload = () => {
                this.ctx.drawImage(img, 0, 0, w, h);
                if (this.placeholder) this.placeholder.style.display = 'none';
            };
            img.src = this.savedDataUrl;
        };

        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(() => {
                if (signerName && (this.savedDataUrl.length === 6742 || this.savedDataUrl.length < 8000)) {
                    const upgraded = DualSignaturePad.generateTypedDataURL(signerName, this.options.fontFamily, this.options.strokeColor);
                    if (upgraded) {
                        this.savedDataUrl = upgraded;
                    }
                }
                render();
            });
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', render);
        } else {
            setTimeout(render, 50);
        }
    }

    lock(badgeText = 'Signature Verified') {
        this.isLocked = true;
        if (this.tabDraw) this.tabDraw.style.pointerEvents = 'none';
        if (this.tabType) this.tabType.style.pointerEvents = 'none';
        if (this.clearBtn) this.clearBtn.style.display = 'none';
        if (this.canvas) {
            this.canvas.style.pointerEvents = 'none';
            this.canvas.style.cursor = 'default';
        }
        if (this.placeholder) this.placeholder.style.display = 'none';
        if (this.typeInput) this.typeInput.disabled = true;

        let badge = this.container.querySelector('.sig-locked-badge');
        if (!badge) {
            badge = document.createElement('div');
            badge.className = 'sig-locked-badge';
            badge.style.cssText = 'position: absolute; top: 0.5rem; right: 0.5rem; background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.4); font-size: 0.75rem; font-weight: 700; padding: 0.25rem 0.6rem; border-radius: 4px; display: flex; align-items: center; gap: 0.35rem; pointer-events: none; z-index: 10;';
            badge.innerHTML = `<span>✓</span> <span>${badgeText}</span>`;
            const wrapper = this.container.querySelector('.sig-canvas-wrapper') || this.container;
            wrapper.style.position = 'relative';
            wrapper.appendChild(badge);
        }
    }

    static generateTypedDataURL(text, fontFamily = DualSignaturePad.FONTS.CO_SIGNER, strokeColor = '#0f172a') {
        const str = (text || '').trim();
        if (!str) return null;

        const offCanvas = document.createElement('canvas');
        offCanvas.width = 480;
        offCanvas.height = 160;
        const offCtx = offCanvas.getContext('2d');

        offCtx.clearRect(0, 0, offCanvas.width, offCanvas.height);

        let fontSize = (fontFamily && fontFamily.includes('Amsterdam')) ? 54 : 60;
        offCtx.font = `normal ${fontSize}px ${fontFamily}`;
        let textWidth = offCtx.measureText(str).width;
        while (textWidth > offCanvas.width - 50 && fontSize > 22) {
            fontSize -= 2;
            offCtx.font = `normal ${fontSize}px ${fontFamily}`;
            textWidth = offCtx.measureText(str).width;
        }

        offCtx.fillStyle = strokeColor;
        offCtx.textAlign = 'center';
        offCtx.textBaseline = 'middle';
        offCtx.save();
        // Perfectly straightened horizontally - NO tilt or slant rotation angle
        offCtx.translate(offCanvas.width / 2, offCanvas.height / 2);
        offCtx.fillText(str, 0, 0);
        offCtx.restore();

        return offCanvas.toDataURL('image/png');
    }

    toDataURL() {
        if (this.savedDataUrl) return this.savedDataUrl;
        if (this.mode === 'draw') {
            return this.canvas ? this.canvas.toDataURL('image/png') : null;
        } else {
            const text = (this.typedText || '').trim();
            if (!text) return null;
            return DualSignaturePad.generateTypedDataURL(text, this.options.fontFamily, this.options.strokeColor);
        }
    }
}

window.DualSignaturePad = DualSignaturePad;
