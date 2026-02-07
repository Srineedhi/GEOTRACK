// ===== OCR Service Module =====

class OCRService {
    constructor() {
        this.worker = null;
    }

    async initWorker(loggerCallback) {
        if (!this.worker) {
            this.worker = await Tesseract.createWorker('eng', 1, {
                logger: m => {
                    if (loggerCallback) loggerCallback(m);
                }
            });
        }
        return this.worker;
    }

    async extractText(file, progressCallback) {
        try {
            const worker = await this.initWorker(progressCallback);
            const key = 'eng';
            // Tesseract v5 API
            const ret = await worker.recognize(file);
            return ret.data.text;
        } catch (error) {
            console.error('OCR Service Error:', error);
            throw new Error('Failed to extract text from image.');
        }
    }

    async terminate() {
        if (this.worker) {
            await this.worker.terminate();
            this.worker = null;
        }
    }
}

// Export a singleton instance
const ocrService = new OCRService();
