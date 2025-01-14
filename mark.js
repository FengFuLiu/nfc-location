// DOM元素
const phoneContainer = document.getElementById('phoneContainer');
const markingArea = document.getElementById('markingArea');
const nfcMarker = document.getElementById('nfcMarker');
const brandInput = document.getElementById('brand');
const modelInput = document.getElementById('model');
const generateBtn = document.getElementById('generateBtn');
const resetBtn = document.getElementById('resetBtn');
const copyMarkBtn = document.getElementById('copyMarkBtn');
const markResult = document.getElementById('markResult');
const aspectRatioInput = document.getElementById('aspectRatio');
const sizeDisplay = document.querySelector('.size-display');
const submitPRBtn = document.getElementById('submitPRBtn');

// 常量定义
const DEFAULT_ASPECT_RATIO = '19.5';
const PHONE_WIDTH = 430;
const GITHUB_REPO_URL = 'https://github.com/FengFuLiu/nfc-location';

// 状态变量
let isDrawing = false;
let startX = 0;
let startY = 0;
let currentMarker = null;

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
 * 更新手机比例
 */
aspectRatioInput.addEventListener('input', function() {
    const ratio = this.value;
    sizeDisplay.textContent = `当前比例：9:${ratio}`;
    phoneContainer.style.aspectRatio = `9/${ratio}`;
});

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

    generateBtn.disabled = false;
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
    submitPRBtn.disabled = true;
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

    const containerRect = phoneContainer.getBoundingClientRect();
    const phoneHeight = PHONE_WIDTH * (parseFloat(aspectRatioInput.value) / 9);

    const scaleX = PHONE_WIDTH / containerRect.width;
    const scaleY = phoneHeight / containerRect.height;

    const result = {
        device: {
            brand: brandInput.value.toUpperCase(),
            model: modelInput.value.toUpperCase(),
            width: Math.round(PHONE_WIDTH),
            height: Math.round(phoneHeight)
        },
        nfcLocation: {
            top: Math.round(currentMarker.top * scaleY),
            left: Math.round(currentMarker.left * scaleX),
            width: Math.round(currentMarker.width * scaleX),
            height: Math.round(currentMarker.height * scaleY)
        }
    };

    markResult.textContent = JSON.stringify(result, null, 2);
    copyMarkBtn.disabled = false;
    submitPRBtn.disabled = false;
    window.currentResult = result;
}

/**
 * 提交PR
 */
async function submitPR() {
    if (!window.currentResult) {
        alert('请先生成JSON结果');
        return;
    }

    const brand = window.currentResult.device.brand;
    const model = window.currentResult.device.model;
    const content = JSON.stringify(window.currentResult, null, 2);
    
    try {
        const branchName = `${brand.toLowerCase()}-${model.toLowerCase()}`;
        const fileName = `${model}.json`;
        
        // 创建JSON文件，添加delete=true参数以自动删除分支
        const jsonUrl = `${GITHUB_REPO_URL}/new/main?filename=data/${brand}/${fileName}&value=${encodeURIComponent(content)}&message=Add ${encodeURIComponent(`${brand} ${model}`)}&description=${encodeURIComponent(`Add NFC location data for ${brand} ${model}`)}&branch=${branchName}&delete=true`;
        
        window.open(jsonUrl, '_blank');
        showSuccessMessage('请在GitHub页面确认并提交PR');
    } catch (err) {
        console.error('创建PR失败:', err);
        alert('创建PR失败，请稍后重试');
    }
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
    aspectRatioInput.value = DEFAULT_ASPECT_RATIO;
    sizeDisplay.textContent = `当前比例：9:${DEFAULT_ASPECT_RATIO}`;
    phoneContainer.style.aspectRatio = `9/${DEFAULT_ASPECT_RATIO}`;
    submitPRBtn.removeEventListener('click', submitPR);
}

// 事件监听器
markingArea.addEventListener('mousedown', startDrawing);
markingArea.addEventListener('mousemove', draw);
markingArea.addEventListener('mouseup', endDrawing);
markingArea.addEventListener('mouseleave', endDrawing);

generateBtn.addEventListener('click', generateResult);
copyMarkBtn.addEventListener('click', copyResult);
resetBtn.addEventListener('click', resetAll);
submitPRBtn.addEventListener('click', submitPR);

brandInput.addEventListener('input', () => {
    generateBtn.disabled = !(brandInput.value && modelInput.value && currentMarker);
});
modelInput.addEventListener('input', () => {
    generateBtn.disabled = !(brandInput.value && modelInput.value && currentMarker);
}); 