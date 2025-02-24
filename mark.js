// 初始化变量
let markingArea, phoneContainer, nfcMarker, generateBtn, copyMarkBtn, resetBtn;
let brandInput, modelInput, markResult;
let currentMarker = null;
let isDrawing = false;
let startX = 0;
let startY = 0;

// 默认值设置（iPhone 13）
const DEFAULT_DEVICE = {
    brand: 'APPLE',
    model: 'IPHONE13',
    width: 71.5,  // 毫米
    height: 146.7 // 毫米
};

const GITHUB_REPO_URL = 'https://github.com/FengFuLiu/nfc-location';

// 初始化函数
function initialize() {
    // 获取DOM元素
    markingArea = document.getElementById('markingArea');
    phoneContainer = document.querySelector('.phone-container');
    generateBtn = document.getElementById('generateBtn');
    copyMarkBtn = document.getElementById('copyMarkBtn');
    resetBtn = document.getElementById('resetBtn');
    brandInput = document.getElementById('brand');
    modelInput = document.getElementById('model');
    markResult = document.getElementById('markResult');

    // 获取物理尺寸输入元素
    const physicalHeight = document.getElementById('physicalHeight');
    const physicalWidth = document.getElementById('physicalWidth');

    // 设置默认值
    if (brandInput && modelInput) {
        brandInput.value = DEFAULT_DEVICE.brand;
        modelInput.value = DEFAULT_DEVICE.model;
    }
    
    if (physicalHeight && physicalWidth) {
        physicalWidth.value = DEFAULT_DEVICE.width;
        physicalHeight.value = DEFAULT_DEVICE.height;
        
        // 设置预览模型尺寸
        if (phoneContainer) {
            const ratio = DEFAULT_DEVICE.height / DEFAULT_DEVICE.width;
            phoneContainer.style.aspectRatio = ratio;
            const previewWidth = Math.min(300, DEFAULT_DEVICE.width * 3);
            const previewHeight = previewWidth * ratio;
            phoneContainer.style.width = `${previewWidth}px`;
            phoneContainer.style.height = `${previewHeight}px`;
        }
    }

    // 创建NFC标记框
    nfcMarker = document.createElement('div');
    nfcMarker.className = 'nfc-marker';
    if (markingArea) {
        markingArea.appendChild(nfcMarker);
    }

    if (!markingArea || !phoneContainer) return;

    // 绑定事件监听器
    markingArea.addEventListener('mousedown', startDrawing);
    markingArea.addEventListener('mousemove', draw);
    markingArea.addEventListener('mouseup', endDrawing);
    markingArea.addEventListener('mouseleave', endDrawing);

    if (generateBtn) generateBtn.addEventListener('click', generateResult);
    if (copyMarkBtn) copyMarkBtn.addEventListener('click', copyResult);
    if (resetBtn) resetBtn.addEventListener('click', resetAll);

    // 添加物理尺寸输入事件
    if (physicalHeight && physicalWidth) {
        const updateFromPhysical = () => {
            const height = Number(physicalHeight.value);
            const width = Number(physicalWidth.value);
            
            if (height && width) {
                // 更新预览模型
                if (phoneContainer) {
                    const ratio = height / width;
                    phoneContainer.style.aspectRatio = ratio;
                    const previewWidth = Math.min(300, width * 3); // 1mm = 3px
                    const previewHeight = previewWidth * ratio;
                    phoneContainer.style.width = `${previewWidth}px`;
                    phoneContainer.style.height = `${previewHeight}px`;
                }
            }
        };

        // 实时更新预览
        physicalHeight.addEventListener('input', updateFromPhysical);
        physicalWidth.addEventListener('input', updateFromPhysical);
    }

    // 品牌和型号事件监听器
    if (brandInput && modelInput) {
        const updateButtonState = () => {
            if (generateBtn) {
                generateBtn.disabled = !(brandInput.value && modelInput.value && currentMarker);
            }
        };

        brandInput.addEventListener('input', updateButtonState);
        modelInput.addEventListener('input', updateButtonState);
    }
}

// 等待DOM加载完成后初始化
document.addEventListener('DOMContentLoaded', initialize);

/**
 * 显示成功提示
 * @param {string} message - 提示信息
 */
function showSuccessMessage(message) {
    const copySuccess = document.createElement('div');
    copySuccess.className = 'copy-success';
    copySuccess.textContent = message;
    document.body.appendChild(copySuccess);
    setTimeout(() => copySuccess.remove(), 2000);
}

/**
 * 开始绘制标记
 */
function startDrawing(e) {
    isDrawing = true;
    const rect = markingArea.getBoundingClientRect();
    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;
    
    nfcMarker.style.display = 'block';
    nfcMarker.style.left = startX + 'px';
    nfcMarker.style.top = startY + 'px';
    nfcMarker.style.width = '0';
    nfcMarker.style.height = '0';
}

/**
 * 绘制标记过程
 */
function draw(e) {
    if (!isDrawing) return;

    const rect = markingArea.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    const width = currentX - startX;
    const height = currentY - startY;

    // 处理负值情况
    if (width < 0) {
        nfcMarker.style.left = currentX + 'px';
        nfcMarker.style.width = Math.abs(width) + 'px';
    } else {
        nfcMarker.style.left = startX + 'px';
        nfcMarker.style.width = width + 'px';
    }

    if (height < 0) {
        nfcMarker.style.top = currentY + 'px';
        nfcMarker.style.height = Math.abs(height) + 'px';
    } else {
        nfcMarker.style.top = startY + 'px';
        nfcMarker.style.height = height + 'px';
    }

    if (generateBtn) {
        generateBtn.disabled = false;
    }
}

/**
 * 结束绘制标记
 */
function endDrawing() {
    if (!isDrawing) return;
    
    isDrawing = false;
    currentMarker = {
        left: parseInt(nfcMarker.style.left),
        top: parseInt(nfcMarker.style.top),
        width: parseInt(nfcMarker.style.width),
        height: parseInt(nfcMarker.style.height)
    };
}

/**
 * 重置标记状态
 */
function resetMarker() {
    nfcMarker.style.display = 'none';
    currentMarker = null;
    generateBtn.disabled = true;
    copyMarkBtn.disabled = true;
    markResult.textContent = '暂无结果';
}

/**
 * 生成JSON结果
 */
function generateResult() {
    if (!currentMarker || !brandInput.value || !modelInput.value) {
        alert('请填写完整信息并标记NFC区域');
        return;
    }

    const physicalHeight = document.getElementById('physicalHeight');
    const physicalWidth = document.getElementById('physicalWidth');
    
    if (!physicalHeight || !physicalWidth || !physicalHeight.value || !physicalWidth.value) {
        alert('请输入物理尺寸');
        return;
    }

    const containerRect = phoneContainer.getBoundingClientRect();
    const pWidth = parseFloat(physicalWidth.value);
    const pHeight = parseFloat(physicalHeight.value);

    // 计算设备比例
    const ratio = parseFloat((pHeight / pWidth).toFixed(4));

    // 计算NFC位置的相对比例
    const result = {
        device: {
            brand: brandInput.value.toUpperCase(),
            model: modelInput.value.toUpperCase(),
            ratio: ratio
        },
        nfcLocation: {
            // 转换为相对比例，保留4位小数
            top: parseFloat((currentMarker.top / containerRect.height).toFixed(4)),
            left: parseFloat((currentMarker.left / containerRect.width).toFixed(4)),
            width: parseFloat((currentMarker.width / containerRect.width).toFixed(4)),
            height: parseFloat((currentMarker.height / containerRect.height).toFixed(4))
        }
    };

    markResult.textContent = JSON.stringify(result, null, 2);
    copyMarkBtn.disabled = false;
    window.currentResult = result;
}

/**
 * 复制JSON结果
 */
async function copyResult() {
    try {
        await navigator.clipboard.writeText(markResult.textContent);
        showSuccessMessage('复制成功！');
    } catch (err) {
        console.error('复制失败:', err);
        alert('复制失败，请手动复制');
    }
}

/**
 * 重置所有状态
 */
function resetAll() {
    resetMarker();
    brandInput.value = '';
    modelInput.value = '';
    
    // 重置为默认值
    const physicalHeight = document.getElementById('physicalHeight');
    const physicalWidth = document.getElementById('physicalWidth');
    
    if (physicalHeight && physicalWidth) {
        physicalWidth.value = DEFAULT_DEVICE.width;
        physicalHeight.value = DEFAULT_DEVICE.height;
    }
    
    // 更新预览模型
    const ratio = DEFAULT_DEVICE.height / DEFAULT_DEVICE.width;
    phoneContainer.style.aspectRatio = ratio;
    const previewWidth = Math.min(300, DEFAULT_DEVICE.width * 3);
    const previewHeight = previewWidth * ratio;
    phoneContainer.style.width = `${previewWidth}px`;
    phoneContainer.style.height = `${previewHeight}px`;
}

// 添加提示信息显示函数
function showMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    messageDiv.textContent = message;
    document.body.appendChild(messageDiv);
    setTimeout(() => messageDiv.remove(), 3000);
} 