const canvas = document.getElementById('imageCanvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const folderInput = document.getElementById('folderInput');
const resultsDiv = document.getElementById('results');
const progressSpan = document.getElementById('progress');
const downloadBtn = document.getElementById('downloadBtn');
const copyBtn = document.getElementById('copyBtn');
const copySuccess = document.getElementById('copySuccess');

let allResults = [];
let totalFiles = 0;
let processedFiles = 0;
let unmatchedImages = [];

// 文件夹上传的处理函数
folderInput.addEventListener('change', async function (e) {
    const files = Array.from(e.target.files).filter(file =>
        file.type.startsWith('image/')
    );

    // 清空之前的结果
    totalFiles = files.length;
    processedFiles = 0;
    allResults = [];
    unmatchedImages = [];
    
    // 清空显示
    updateResults(allResults);
    updateProgress();
    
    // 移除之前的异常检测结果统计
    const oldSummary = document.querySelector('.summary');
    if (oldSummary) {
        oldSummary.remove();
    }

    // 处理新文件
    for (const file of files) {
        await processFile(file);
    }

    showUnmatchedSummary();
});

// 下载结果
downloadBtn.addEventListener('click', function () {
    const jsonString = JSON.stringify(allResults, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nfc_locations.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});

// 更新进度显示
function updateProgress() {
    progressSpan.textContent = `${processedFiles}/${totalFiles}`;
}

// 从文件路径构建模型名称
function buildModelName(filePath) {
    const parts = filePath.split('/');
    parts.pop();
    return parts.filter(part => part).join(' ');
}

// 处理单个文件
async function processFile(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = function(event) {
            const img = new Image();
            img.onload = function() {
                const result = processImage(img);

                if (result) {
                    const pathParts = file.webkitRelativePath.split('/').filter(part => part);
                    let model = 'UNKNOWN';
                    let brand = 'UNKNOWN';
                    
                    if (pathParts.length >= 2) {
                        model = pathParts[pathParts.length - 2];
                        if (pathParts.length >= 3) {
                            brand = pathParts[pathParts.length - 3];
                        }
                    }

                    // 检查异常情况
                    const isAbnormal = checkAbnormalResult(result.nfcLocation);
                    if (isAbnormal) {
                        // 如果是异常情况，只添加到未匹配列表，不添加到结果中
                        unmatchedImages.push({
                            name: file.name,
                            path: file.webkitRelativePath,
                            reason: isAbnormal,
                            data: {
                                deviceWidth: result.nfcLocation.deviceWidth,
                                deviceHeight: result.nfcLocation.deviceHeight,
                                nfcTop: result.nfcLocation.top,
                                nfcLeft: result.nfcLocation.left,
                                nfcWidth: result.nfcLocation.width,
                                nfcHeight: result.nfcLocation.height
                            },
                            imageData: event.target.result
                        });
                    } else {
                        // 只有正常的结果才添加到 JSON 中
                        const resultObject = {
                            device: {
                                brand: brand.toUpperCase(),
                                model: model.toUpperCase(),
                                width: result.nfcLocation.deviceWidth,
                                height: result.nfcLocation.deviceHeight
                            },
                            nfcLocation: {
                                top: result.nfcLocation.top,
                                left: result.nfcLocation.left,
                                width: result.nfcLocation.width,
                                height: result.nfcLocation.height
                            }
                        };
                        allResults.push(resultObject);
                    }
                } else {
                    // 未检测到 NFC 区域的情况
                    unmatchedImages.push({
                        name: file.name,
                        path: file.webkitRelativePath,
                        reason: '未检测到有效的NFC区域',
                        imageData: event.target.result
                    });
                }

                // 更新显示
                updateResults(allResults);
                processedFiles++;
                updateProgress();
                resolve();
            }
            img.src = event.target.result;
        }
        reader.readAsDataURL(file);
    });
}

// 检测设备边界
function detectDeviceBounds(imageData, width, height) {
    const data = imageData.data;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;

    // 用于记录每行和每列的非透明且非白色像素计数
    const rowCounts = new Array(height).fill(0);
    const colCounts = new Array(width).fill(0);

    // 第一遍扫描：统计每行每列的有效像素
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const index = (y * width + x) * 4;
            const r = data[index];
            const g = data[index + 1];
            const b = data[index + 2];
            const a = data[index + 3];

            // 改进的像素检测逻辑
            // 1. 检查透明度
            const isTransparent = a < 10;
            // 2. 检查是否是纯白色或接近白色
            const isWhite = r > 240 && g > 240 && b > 240;
            // 3. 检查是否是设备的一部分（通常是灰色或其他颜色）
            const isDevicePixel = !isTransparent && !isWhite;

            if (isDevicePixel) {
                rowCounts[y]++;
                colCounts[x]++;
            }
        }
    }

    // 设定最小有效像素阈值（比如行宽度的1%）
    const minRowPixels = Math.floor(width * 0.01);
    const minColPixels = Math.floor(height * 0.01);

    // 查找有效的设备边界
    let foundTop = false;
    let foundBottom = false;
    let foundLeft = false;
    let foundRight = false;

    // 从上到下查找第一个有效行
    for (let y = 0; y < height; y++) {
        if (!foundTop && rowCounts[y] > minRowPixels) {
            minY = y;
            foundTop = true;
        }
        if (foundTop && !foundBottom && y > minY) {
            // 检查是否是真正的底部边界
            let isGap = true;
            for (let checkY = y; checkY < Math.min(y + 10, height); checkY++) {
                if (rowCounts[checkY] > minRowPixels) {
                    isGap = false;
                    break;
                }
            }
            if (isGap) {
                maxY = y - 1;
                foundBottom = true;
            }
        }
    }

    // 从左到右查找第一个有效列
    for (let x = 0; x < width; x++) {
        if (!foundLeft && colCounts[x] > minColPixels) {
            minX = x;
            foundLeft = true;
        }
        if (foundLeft && !foundRight && x > minX) {
            // 检查是否是真正的右侧边界
            let isGap = true;
            for (let checkX = x; checkX < Math.min(x + 10, width); checkX++) {
                if (colCounts[checkX] > minColPixels) {
                    isGap = false;
                    break;
                }
            }
            if (isGap) {
                maxX = x - 1;
                foundRight = true;
            }
        }
    }

    // 如果没有找到底部或右侧边界，使用最后的有效位置
    if (!foundBottom) {
        for (let y = height - 1; y >= minY; y--) {
            if (rowCounts[y] > minRowPixels) {
                maxY = y;
                break;
            }
        }
    }
    if (!foundRight) {
        for (let x = width - 1; x >= minX; x--) {
            if (colCounts[x] > minColPixels) {
                maxX = x;
                break;
            }
        }
    }

    // 验证检测到的边界是否合理
    const detectedWidth = maxX - minX;
    const detectedHeight = maxY - minY;
    const aspectRatio = detectedWidth / detectedHeight;

    // 手机的宽高比通常在 0.4 到 0.6 之间
    if (aspectRatio < 0.4 || aspectRatio > 0.6 || 
        detectedWidth < width * 0.2 || detectedHeight < height * 0.2) {
        return {
            x: 0,
            y: 0,
            width: width,
            height: height
        };
    }

    return {
        x: minX,
        y: minY,
        width: detectedWidth,
        height: detectedHeight
    };
}

// 处理图片
function processImage(img) {
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    // 检测设备边界
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const deviceBounds = detectDeviceBounds(imageData, canvas.width, canvas.height);
    
    // 在原图上标记设备边界
    ctx.strokeStyle = '#00FF00';  // 使用绿色
    ctx.lineWidth = 2;
    ctx.strokeRect(deviceBounds.x, deviceBounds.y, deviceBounds.width, deviceBounds.height);

    // 获取裁剪后的设备区域的图像数据
    const deviceImageData = ctx.getImageData(
        deviceBounds.x, 
        deviceBounds.y, 
        deviceBounds.width, 
        deviceBounds.height
    );

    // 使用检测到的设备尺寸和裁剪后的图像数据
    return detectRedRectangle(deviceImageData, deviceBounds.width, deviceBounds.height);
}

function detectRedRectangle(deviceImageData, deviceWidth, deviceHeight) {
    if (!deviceImageData || !deviceWidth || !deviceHeight) {
        return null;
    }

    let result = detectColorRegion(deviceImageData, deviceWidth, deviceHeight, 
        (r, g, b) => {
            // 更精确的红色检测条件
            return r > 180 && // 降低红色阈值
                   g < 80 && // 提高绿色容差
                   b < 80 && // 提高蓝色容差
                   (r - g) > 100 && // 确保红色分量显著高于其他分量
                   (r - b) > 100;
        },
        '红色'
    );

    if (!result) {
        // 如果没有检测到红色区域，尝试检测黑色实线
        result = detectColorRegion(deviceImageData, deviceWidth, deviceHeight, 
            (r, g, b) => {
                // 更严格的黑色检测条件
                const brightness = (r + g + b) / 3;
                return brightness < 50 && Math.abs(r - g) < 10 && Math.abs(g - b) < 10;
            },
            '黑色'
        );
    }

    return result;
}

function detectColorRegion(deviceImageData, deviceWidth, deviceHeight, colorCondition, colorName) {
    if (!deviceImageData || !deviceImageData.data || !deviceWidth || !deviceHeight) {
        return null;
    }

    const data = deviceImageData.data;
    let minX = deviceWidth;
    let minY = deviceHeight;
    let maxX = 0;
    let maxY = 0;
    let foundColor = false;
    let colorPixelCount = 0;
    const totalPixels = deviceWidth * deviceHeight;

    // 遍历裁剪后的设备区域
    for (let y = 0; y < deviceHeight; y++) {
        for (let x = 0; x < deviceWidth; x++) {
            const index = (y * deviceWidth + x) * 4;
            const r = data[index];
            const g = data[index + 1];
            const b = data[index + 2];
            
            if (colorCondition(r, g, b)) {
                colorPixelCount++;
                foundColor = true;
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
            }
        }
    }

    if (foundColor) {
        // 调整坐标确保在线内
        minX += 1;
        minY += 1;
        maxX -= 1;
        maxY -= 1;

        // 重新计算宽高
        const adjustedWidth = maxX - minX;
        const adjustedHeight = maxY - minY;

        // 返回相对于设备边界的坐标
        const result = {
            nfcLocation: {
                top: minY,
                left: minX,
                width: adjustedWidth,
                height: adjustedHeight,
                deviceWidth: deviceWidth,
                deviceHeight: deviceHeight
            }
        };

        return result;
    }

    return null;
}

// 显示结果
function updateResults(results) {
    const formattedJson = JSON.stringify(results, null, 2);
    resultsDiv.textContent = formattedJson;

    // 如果有结果，显示复制和下载按钮
    if (results && results.length > 0) {
        copyBtn.style.display = 'block';
        downloadBtn.style.display = 'block';
    } else {
        copyBtn.style.display = 'none';
        downloadBtn.style.display = 'none';
    }
}

// 复制功能
copyBtn.addEventListener('click', async function () {
    try {
        const formattedJson = JSON.stringify(allResults, null, 2);
        await navigator.clipboard.writeText(formattedJson);
        
        // 显示复制成功提示
        const copySuccess = document.createElement('div');
        copySuccess.className = 'copy-success';
        copySuccess.textContent = '复制成功！';
        copySuccess.style.display = 'block'; // 确保提示显示
        document.body.appendChild(copySuccess);
        
        // 2秒后移除提示
        setTimeout(() => {
            copySuccess.remove();
        }, 2000);
    } catch (err) {
        console.error('复制失败:', err);
        // 如果 clipboard API 失败，尝试使用传统方法
        try {
            const textArea = document.createElement('textarea');
            textArea.value = JSON.stringify(allResults, null, 2);
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            
            // 显示复制成功提示
            const copySuccess = document.createElement('div');
            copySuccess.className = 'copy-success';
            copySuccess.textContent = '复制成功！';
            copySuccess.style.display = 'block'; // 确保提示显示
            document.body.appendChild(copySuccess);
            
            // 2秒后移除提示
            setTimeout(() => {
                copySuccess.remove();
            }, 2000);
        } catch (fallbackErr) {
            console.error('备用复制方法也失败:', fallbackErr);
            alert('复制失败，请手动复制');
        }
    }
});

// 检查异常结果
function checkAbnormalResult(nfcLocation) {
    const {
        top,
        left,
        width,
        height,
        deviceWidth,
        deviceHeight
    } = nfcLocation;

    // 检查设备尺寸是否异常（可能是部分图片）
    const normalAspectRatioMin = 0.4;
    const normalAspectRatioMax = 0.65;
    const currentAspectRatio = deviceWidth / deviceHeight;

    if (currentAspectRatio < normalAspectRatioMin || currentAspectRatio > normalAspectRatioMax) {
        return '设备宽高比异常';
    }

    // 检查 NFC 区域大小是否合理
    const nfcAreaRatio = (width * height) / (deviceWidth * deviceHeight);
    if (nfcAreaRatio > 0.3) {
        return 'NFC区域过大';
    }

    // 检查 NFC 区域的位置是否在合理范围内
    if (top < 0 || left < 0 || top + height > deviceHeight || left + width > deviceWidth) {
        return 'NFC区域位置异常';
    }

    return null;
}

// 显示未匹配图片
function showUnmatchedSummary() {
    if (unmatchedImages.length > 0) {
        // 按主要类别分组
        const groupedByReason = {
            '设备宽高比异常': [],
            'NFC区域过大': [],
            'NFC区域位置异常': [],
            '未检测到有效的NFC区域': []
        };

        unmatchedImages.forEach(img => {
            const reason = img.reason;
            // 确保分组存在，如果是新的原因，添加到其他类别
            if (groupedByReason.hasOwnProperty(reason)) {
                groupedByReason[reason].push(img);
            }
        });

        const summaryDiv = document.createElement('div');
        summaryDiv.className = 'summary';
        
        // 创建信息部分
        const infoDiv = document.createElement('div');
        infoDiv.className = 'summary-info';
        infoDiv.innerHTML = `
            <h3>异常检测结果统计</h3>
            <p>总图片数: ${totalFiles}</p>
            <p>成功匹配: ${allResults.length}</p>
            <p>异常检测: ${unmatchedImages.length}</p>
            ${Object.entries(groupedByReason)
                .filter(([_, images]) => images.length > 0) // 只显示有图片的分类
                .map(([reason, images]) => `
                    <div class="reason-group">
                        <h4>${reason} (${images.length}张)</h4>
                        <ul>
                            ${images.map((img, index) => `
                                <li data-group="${reason}" data-index="${index}" onclick="showPreview('${reason}', ${index})">
                                    <strong>${img.path}</strong><br>
                                    ${img.data ? `
                                        设备尺寸: ${img.data.deviceWidth}x${img.data.deviceHeight}<br>
                                        NFC位置: (${img.data.nfcLeft}, ${img.data.nfcTop}, ${img.data.nfcWidth}, ${img.data.nfcHeight})
                                    ` : ''}
                                </li>
                            `).join('')}
                        </ul>
                    </div>
                `).join('')}
        `;

        // 创建预览部分
        const previewDiv = document.createElement('div');
        previewDiv.className = 'summary-preview';
        previewDiv.innerHTML = `
            <h4>图片预览</h4>
            <canvas id="previewCanvas"></canvas>
            <p id="previewPlaceholder">点击左侧列表查看图片预览</p>
        `;

        summaryDiv.appendChild(infoDiv);
        summaryDiv.appendChild(previewDiv);
        resultsDiv.parentNode.insertBefore(summaryDiv, resultsDiv);
    }
}

// 预览功能
function showPreview(reason, index) {
    const groupedImages = unmatchedImages.filter(img => img.reason === reason);
    const img = groupedImages[index];
    const previewCanvas = document.getElementById('previewCanvas');
    const placeholder = document.getElementById('previewPlaceholder');
    const ctx = previewCanvas.getContext('2d');
    
    // 移除所有 li 的 active 类
    document.querySelectorAll('.summary li').forEach(li => {
        li.classList.remove('active');
    });
    
    // 添加 active 类到当前选中的 li
    document.querySelector(`.summary li[data-group="${reason}"][data-index="${index}"]`).classList.add('active');

    // 加载并显示图片
    const image = new Image();
    image.onload = function() {
        // 设置canvas尺寸
        previewCanvas.width = image.width;
        previewCanvas.height = image.height;
        previewCanvas.style.display = 'block';
        placeholder.style.display = 'none';

        // 绘制原图
        ctx.drawImage(image, 0, 0);

        // 如果有设备边界信息，绘制边界框
        if (img.data) {
            // 绘制设备边界（绿色）
            ctx.strokeStyle = '#00FF00';
            ctx.lineWidth = 2;
            ctx.strokeRect(0, 0, img.data.deviceWidth, img.data.deviceHeight);

            // 绘制NFC区域（蓝色）
            ctx.strokeStyle = '#0000FF';
            ctx.lineWidth = 2;
            ctx.strokeRect(
                img.data.nfcLeft,
                img.data.nfcTop,
                img.data.nfcWidth,
                img.data.nfcHeight
            );

            // 添加图例说明
            ctx.font = '14px Arial';
            ctx.fillStyle = '#00FF00';
            ctx.fillText('设备边界', 10, 20);
            ctx.fillStyle = '#0000FF';
            ctx.fillText('NFC区域', 10, 40);
        }
    };
    image.src = img.imageData;
} 