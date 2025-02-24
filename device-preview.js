// 设备预览系统
class DevicePreviewSystem {
    constructor() {
        this.currentZoom = 1;
        this.gridSize = 20;
        this.isDrawing = false;
        this.startX = 0;
        this.startY = 0;
        this.baseWidth = 300; // 修改基准宽度为300px
        
        // 在构造函数中初始化默认比例
        this.setAspectRatio(19.5);
        this.setupEventListeners();
    }

    // 设置屏幕比例
    setAspectRatio(ratio) {
        const container = document.querySelector('.phone-container');
        if (!container) return;
        
        const width = this.baseWidth; // 使用较小的基准宽度
        const height = (width * ratio) / 9; // 根据比例计算高度
        
        container.style.setProperty('--phone-width', `${width}px`);
        container.style.setProperty('--phone-height', `${height}px`);
        
        // 更新网格
        this.updateGrid();
    }

    // 缩放控制
    setZoom(level) {
        this.currentZoom = level;
        const container = document.querySelector('.phone-container');
        if (!container) return;
        
        container.style.transform = `scale(${level})`;
        this.updateGrid();
    }

    // 更新网格
    updateGrid() {
        const grid = document.querySelector('.marking-grid');
        if (!grid) return;
        
        const size = this.gridSize * this.currentZoom;
        grid.style.setProperty('--grid-size', `${size}px`);
    }

    // 开始绘制
    startDrawing(e) {
        const markingArea = document.querySelector('.marking-area');
        if (!markingArea) return;

        const rect = markingArea.getBoundingClientRect();
        this.isDrawing = true;
        this.startX = e.clientX - rect.left;
        this.startY = e.clientY - rect.top;

        // 创建或重置NFC标记框
        let nfcMarker = document.querySelector('.nfc-marker');
        if (!nfcMarker) {
            nfcMarker = document.createElement('div');
            nfcMarker.className = 'nfc-marker';
            markingArea.appendChild(nfcMarker);
        }
        
        nfcMarker.style.left = `${this.startX}px`;
        nfcMarker.style.top = `${this.startY}px`;
        nfcMarker.style.width = '0';
        nfcMarker.style.height = '0';
        nfcMarker.style.display = 'block';
    }

    // 绘制过程
    draw(e) {
        if (!this.isDrawing) return;

        const markingArea = document.querySelector('.marking-area');
        const nfcMarker = document.querySelector('.nfc-marker');
        if (!markingArea || !nfcMarker) return;

        const rect = markingArea.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;

        const width = currentX - this.startX;
        const height = currentY - this.startY;

        // 处理负值情况
        if (width < 0) {
            nfcMarker.style.left = `${currentX}px`;
            nfcMarker.style.width = `${Math.abs(width)}px`;
        } else {
            nfcMarker.style.left = `${this.startX}px`;
            nfcMarker.style.width = `${width}px`;
        }

        if (height < 0) {
            nfcMarker.style.top = `${currentY}px`;
            nfcMarker.style.height = `${Math.abs(height)}px`;
        } else {
            nfcMarker.style.top = `${this.startY}px`;
            nfcMarker.style.height = `${height}px`;
        }

        const generateBtn = document.getElementById('generateBtn');
        if (generateBtn) {
            generateBtn.disabled = false;
        }
    }

    // 结束绘制
    endDrawing() {
        this.isDrawing = false;
    }

    // 获取标记数据
    getNFCLocation() {
        const nfcMarker = document.querySelector('.nfc-marker');
        const container = document.querySelector('.phone-container');
        if (!nfcMarker) return null;

        const containerRect = container.getBoundingClientRect();
        const markerRect = nfcMarker.getBoundingClientRect();

        return {
            top: (markerRect.top - containerRect.top) / containerRect.height,
            left: (markerRect.left - containerRect.left) / containerRect.width,
            width: markerRect.width / containerRect.width,
            height: markerRect.height / containerRect.height
        };
    }

    // 重置标记
    reset() {
        const nfcMarker = document.querySelector('.nfc-marker');
        if (nfcMarker) {
            nfcMarker.style.display = 'none';
        }
        document.getElementById('generateBtn').disabled = true;
    }

    // 设置事件监听
    setupEventListeners() {
        // 等待DOM加载完成
        document.addEventListener('DOMContentLoaded', () => {
            const markingArea = document.querySelector('.marking-area');
            const aspectRatioInput = document.getElementById('aspectRatio');
            const resetBtn = document.getElementById('resetBtn');
            
            if (markingArea) {
                markingArea.addEventListener('mousedown', (e) => this.startDrawing(e));
                markingArea.addEventListener('mousemove', (e) => this.draw(e));
                markingArea.addEventListener('mouseup', () => this.endDrawing());
                markingArea.addEventListener('mouseleave', () => this.endDrawing());
            }

            if (aspectRatioInput) {
                aspectRatioInput.addEventListener('input', (e) => {
                    const ratio = parseFloat(e.target.value);
                    this.setAspectRatio(ratio);
                    const display = document.querySelector('.size-display');
                    if (display) {
                        display.textContent = `当前比例：9:${ratio}`;
                    }
                });
            }

            document.querySelectorAll('.zoom-button').forEach(button => {
                button.addEventListener('click', (e) => {
                    const zoom = parseFloat(e.target.dataset.zoom);
                    this.setZoom(zoom);
                });
            });

            if (resetBtn) {
                resetBtn.addEventListener('click', () => this.reset());
            }
        });
    }
}

// 初始化系统
const devicePreview = new DevicePreviewSystem();

// 导出系统实例
export default devicePreview; 