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

let isDrawing = false;
let startX = 0;
let startY = 0;
let currentMarker = null;

// 更新手机比例
aspectRatioInput.addEventListener('input', function() {
    const ratio = this.value;
    phoneContainer.style.aspectRatio = `9/${ratio}`;
    sizeDisplay.textContent = `当前比例：9:${ratio}`;
});

// 标记区域事件处理
markingArea.addEventListener('mousedown', startDrawing);
markingArea.addEventListener('mousemove', draw);
markingArea.addEventListener('mouseup', endDrawing);
markingArea.addEventListener('mouseleave', endDrawing);

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

function draw(e) {
    if (!isDrawing) return;

    const rect = markingArea.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    const width = currentX - startX;
    const height = currentY - startY;

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

function endDrawing() {
    isDrawing = false;
    currentMarker = {
        left: parseInt(nfcMarker.style.left),
        top: parseInt(nfcMarker.style.top),
        width: parseInt(nfcMarker.style.width),
        height: parseInt(nfcMarker.style.height)
    };
}

function resetMarker() {
    nfcMarker.style.display = 'none';
    currentMarker = null;
    generateBtn.disabled = true;
    copyMarkBtn.disabled = true;
    markResult.textContent = '暂无结果';
}

// 生成JSON结果
generateBtn.addEventListener('click', function() {
    if (!currentMarker || !brandInput.value || !modelInput.value) {
        alert('请填写完整信息并标记NFC区域');
        return;
    }

    const containerRect = phoneContainer.getBoundingClientRect();
    const phoneWidth = 430; // 修改为设计稿宽度
    const phoneHeight = phoneWidth * (parseFloat(aspectRatioInput.value) / 9); // 根据比例计算高度

    // 转换坐标为实际手机尺寸
    const scaleX = phoneWidth / containerRect.width;
    const scaleY = phoneHeight / containerRect.height;

    const result = {
        device: {
            brand: brandInput.value.toUpperCase(),
            model: modelInput.value.toUpperCase(),
            width: Math.round(phoneWidth),
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
});

// 复制按钮事件
copyMarkBtn.addEventListener('click', async function() {
    try {
        await navigator.clipboard.writeText(markResult.textContent);
        
        // 显示复制成功提示
        const copySuccess = document.createElement('div');
        copySuccess.className = 'copy-success';
        copySuccess.textContent = '复制成功！';
        document.body.appendChild(copySuccess);
        
        // 2秒后移除提示
        setTimeout(() => {
            copySuccess.remove();
        }, 2000);
    } catch (err) {
        console.error('复制失败:', err);
        alert('复制失败，请手动复制');
    }
});

// 输入框事件
function checkInputs() {
    generateBtn.disabled = !(brandInput.value && modelInput.value && currentMarker);
}

brandInput.addEventListener('input', checkInputs);
modelInput.addEventListener('input', checkInputs);

// 重置按钮事件
resetBtn.addEventListener('click', function() {
    // 重置标记区域
    nfcMarker.style.display = 'none';
    currentMarker = null;
    
    // 重置按钮状态
    generateBtn.disabled = true;
    copyMarkBtn.disabled = true;
    
    // 重置结果显示
    markResult.textContent = '暂无结果';
    
    // 重置输入框
    brandInput.value = '';
    modelInput.value = '';
    
    // 重置比例
    aspectRatioInput.value = '19.5';
    sizeDisplay.textContent = '当前比例：9:19.5';
    phoneContainer.style.aspectRatio = '9/19.5';
}); 