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
let nfcModel = null;
const modelUpload = document.getElementById('modelUpload');
const uploadModelBtn = document.getElementById('uploadModelBtn');
const modelStatus = document.getElementById('modelStatus');
const detectionModeInputs = document.getElementsByName('detectionMode');

// 添加新的DOM元素引用
const imageListContainer = document.createElement('div');
imageListContainer.className = 'image-list-container';
const paginationContainer = document.createElement('div');
paginationContainer.className = 'pagination-container';

// 将新元素添加到页面
resultsDiv.parentNode.insertBefore(imageListContainer, resultsDiv);
resultsDiv.parentNode.insertBefore(paginationContainer, resultsDiv);

// 图片列表相关变量
let currentPage = 1;
const imagesPerPage = 9;
let processedImagesList = [];

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
        reader.onload = async function(event) {
            const img = new Image();
            img.onload = async function() {
                try {
                    const result = await processImage(img);
                    
                    // 将处理结果添加到图片列表
                    processedImagesList.push({
                        name: file.name,
                        path: file.webkitRelativePath,
                        imageUrl: event.target.result,
                        result: result
                    });
                    
                    if (result && result.nfcLocation) {
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
                            unmatchedImages.push({
                                name: file.name,
                                path: file.webkitRelativePath,
                                reason: isAbnormal,
                                data: result.nfcLocation,
                                imageData: event.target.result
                            });
                        } else {
                            // 计算设备比例和相对位置
                            const deviceRatio = parseFloat((result.nfcLocation.deviceHeight / result.nfcLocation.deviceWidth).toFixed(4));
                            const resultObject = {
                                device: {
                                    brand: brand.toUpperCase(),
                                    model: model.toUpperCase(),
                                    ratio: deviceRatio
                                },
                                nfcLocation: {
                                    // 计算比例值，保留4位小数
                                    top: parseFloat((result.nfcLocation.top / result.nfcLocation.deviceHeight).toFixed(4)),
                                    left: parseFloat((result.nfcLocation.left / result.nfcLocation.deviceWidth).toFixed(4)),
                                    width: parseFloat((result.nfcLocation.width / result.nfcLocation.deviceWidth).toFixed(4)),
                                    height: parseFloat((result.nfcLocation.height / result.nfcLocation.deviceHeight).toFixed(4))
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

                    // 更新进度和显示
                    processedFiles++;
                    updateProgress();
                    updateResults(allResults);
                    resolve();
                } catch (error) {
                    console.error('处理图片失败:', error);
                    processedImagesList.push({
                        name: file.name,
                        path: file.webkitRelativePath,
                        imageUrl: event.target.result,
                        error: error.message
                    });
                    processedFiles++;
                    updateProgress();
                    resolve();
                }
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

// 监听检测模式变化
detectionModeInputs.forEach(input => {
    input.addEventListener('change', (e) => {
        const modelUploadDiv = document.querySelector('.model-upload');
        if (e.target.value === 'model') {
            modelUploadDiv.style.display = 'block';
        } else {
            modelUploadDiv.style.display = 'none';
        }
    });
});

// 点击上传按钮时触发文件选择
uploadModelBtn.addEventListener('click', () => {
    modelUpload.click();
});

// 处理模型文件上传
modelUpload.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
        modelStatus.textContent = '正在加载模型...';
        console.log('开始加载模型文件...');
        
        if (file.name.endsWith('.zip')) {
            // 处理 zip 文件
            const zip = new JSZip();
            console.log('解压模型文件...');
            const zipContent = await zip.loadAsync(file);
            
            // 验证必要文件是否存在
            if (!zipContent.file('model.json') || !zipContent.file('nfc-detector-model.weights.bin')) {
                throw new Error('模型文件不完整，缺少必要的文件');
            }
            
            // 读取 model.json
            console.log('读取模型结构...');
            const modelJSON = await zipContent.file('model.json').async('text');
            const modelTopology = JSON.parse(modelJSON);
            
            // 验证模型结构
            if (!modelTopology.weightsManifest) {
                throw new Error('模型结构不完整，缺少权重清单');
            }
            
            // 读取权重文件
            console.log('读取模型权重...');
            const weightData = await zipContent.file('nfc-detector-model.weights.bin').async('arraybuffer');
            
            // 构建完整的模型数据
            console.log('构建模型数据...');
            const modelArtifacts = {
                modelTopology: modelTopology,
                weightSpecs: modelTopology.weightsManifest[0].weights,
                weightData: weightData,
                format: 'layers-model',
                generatedBy: 'TensorFlow.js',
                convertedBy: null,
                userDefinedMetadata: {}
            };
            
            // 加载模型
            console.log('加载模型到 TensorFlow.js...');
            nfcModel = await tf.loadLayersModel(tf.io.fromMemory(modelArtifacts));
            
            console.log('模型加载成功！');
            modelStatus.textContent = '模型加载成功';
            uploadModelBtn.style.backgroundColor = 'var(--success-color)';
        } else {
            throw new Error('请上传 .zip 格式的模型文件');
        }
    } catch (error) {
        console.error('加载模型失败:', error);
        modelStatus.textContent = '模型加载失败: ' + error.message;
        uploadModelBtn.style.backgroundColor = 'var(--error-color)';
        nfcModel = null;
    }
});

// 检查异常结果
function checkAbnormalResult(nfcLocation) {
    // 添加空值检查
    if (!nfcLocation) {
        return '未检测到NFC区域';
    }

    const {
        top,
        left,
        width,
        height,
        deviceWidth,
        deviceHeight
    } = nfcLocation;

    // 检查必要的属性是否都存在
    if (top === undefined || left === undefined || 
        width === undefined || height === undefined || 
        deviceWidth === undefined || deviceHeight === undefined) {
        return 'NFC位置数据不完整';
    }

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

// 修改处理图片的函数，确保返回正确的格式
async function processImage(img) {
    let tensor = null;
    // 获取当前选择的检测模式
    const detectionMode = document.querySelector('input[name="detectionMode"]:checked').value;
    
    if (detectionMode === 'traditional') {
        // 使用原有的图像处理方式
        return processTraditionalMode(img);
    } else {
        // 使用模型检测
        if (!nfcModel) {
            throw new Error('请先加载模型');
        }

        try {
            // 预处理图像
            tensor = tf.tidy(() => {
                // 1. 转换为张量
                let imageTensor = tf.browser.fromPixels(img);
                
                // 2. 标准化尺寸
                imageTensor = tf.image.resizeBilinear(imageTensor, [224, 224]);
                
                // 3. 数据归一化
                imageTensor = imageTensor.toFloat().div(255.0);
                
                // 4. 对比度增强
                const factor = 2;
                const mean = imageTensor.mean();
                imageTensor = imageTensor.sub(mean).mul(factor).add(mean);
                imageTensor = tf.clipByValue(imageTensor, 0, 1);
                
                // 5. 扩展维度
                imageTensor = imageTensor.expandDims();
                
                return imageTensor;
            });

            // 使用模型进行多次预测并取平均值
            const numPredictions = 3;
            let predictions = [];
            
            for (let i = 0; i < numPredictions; i++) {
                const pred = await nfcModel.predict(tensor).array();
                if (!pred || !pred[0] || pred[0].length !== 4) {
                    throw new Error('模型预测结果格式不正确');
                }
                predictions.push(pred[0]);
            }

            // 计算平均预测值
            const avgPrediction = predictions.reduce((acc, curr) => {
                return curr.map((val, idx) => acc[idx] + val / numPredictions);
            }, [0, 0, 0, 0]);

            const [x, y, width, height] = avgPrediction;

            // 在画布上显示检测结果
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            
            // 将归一化坐标转换为实际像素坐标，并添加置信度检查
            const actualX = Math.max(0, Math.min(x * img.width, img.width));
            const actualY = Math.max(0, Math.min(y * img.height, img.height));
            const actualWidth = Math.max(10, Math.min(width * img.width, img.width - actualX));  // 最小宽度10像素
            const actualHeight = Math.max(10, Math.min(height * img.height, img.height - actualY)); // 最小高度10像素

            // 计算预测框的面积比例
            const areaRatio = (actualWidth * actualHeight) / (img.width * img.height);
            if (areaRatio > 0.5 || areaRatio < 0.001) {
                console.log('预测框面积比例异常:', areaRatio);
                return null;
            }

            // 绘制检测框
            ctx.strokeStyle = '#00FF00';
            ctx.lineWidth = 2;
            ctx.strokeRect(actualX, actualY, actualWidth, actualHeight);

            // 添加预测框的标注
            ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
            ctx.fillRect(actualX, actualY, actualWidth, actualHeight);
            
            // 显示预测置信度
            ctx.fillStyle = '#00FF00';
            ctx.font = '14px Arial';
            ctx.fillText(`NFC区域 (${Math.round(areaRatio * 100)}%)`, actualX, actualY - 5);

            // 返回检测结果
            return {
                nfcLocation: {
                    top: actualY,
                    left: actualX,
                    width: actualWidth,
                    height: actualHeight,
                    deviceWidth: img.width,
                    deviceHeight: img.height,
                    confidence: areaRatio
                }
            };
        } catch (error) {
            console.error('模型预测失败:', error);
            return null;
        } finally {
            // 清理内存
            if (tensor) {
                tensor.dispose();
            }
        }
    }
}

// 传统模式处理函数
function processTraditionalMode(img) {
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    // 检测设备边界
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const deviceBounds = detectDeviceBounds(imageData, canvas.width, canvas.height);
    
    // 获取裁剪后的设备区域的图像数据
    const deviceImageData = ctx.getImageData(
        deviceBounds.x, 
        deviceBounds.y, 
        deviceBounds.width, 
        deviceBounds.height
    );

    // 使用检测到的设备尺寸和裁剪后的图像数据
    const nfcResult = detectRedRectangle(deviceImageData, deviceBounds.width, deviceBounds.height);
    
    if (nfcResult && nfcResult.nfcLocation) {
        // 保持原始坐标用于返回结果
        const originalLeft = nfcResult.nfcLocation.left;
        const originalTop = nfcResult.nfcLocation.top;

        // 在原图上标记设备边界（使用蓝色）
        ctx.strokeStyle = '#0066FF';
        ctx.lineWidth = 2;
        ctx.strokeRect(deviceBounds.x, deviceBounds.y, deviceBounds.width, deviceBounds.height);

        // 在设备边界内绘制NFC区域（使用黄色）
        ctx.strokeStyle = '#FFD700';
        const displayLeft = deviceBounds.x + originalLeft;
        const displayTop = deviceBounds.y + originalTop;
        
        ctx.strokeRect(
            displayLeft,
            displayTop,
            nfcResult.nfcLocation.width,
            nfcResult.nfcLocation.height
        );

        // 返回原始坐标（不变）
        return {
            nfcLocation: {
                left: originalLeft,
                top: originalTop,
                width: nfcResult.nfcLocation.width,
                height: nfcResult.nfcLocation.height,
                deviceWidth: deviceBounds.width,
                deviceHeight: deviceBounds.height
            }
        };
    }

    return null;
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

// 更新显示结果的函数
function updateResults(results) {
    console.log('更新结果:', results); // 添加调试日志
    
    // 如果有结果，显示复制和下载按钮
    if (results && results.length > 0) {
        copyBtn.style.display = 'block';
        downloadBtn.style.display = 'block';
        // 在 resultsDiv 中显示格式化的 JSON
        resultsDiv.textContent = JSON.stringify(results, null, 2);
    } else {
        copyBtn.style.display = 'none';
        downloadBtn.style.display = 'none';
        resultsDiv.textContent = '暂无结果';
    }

    // 更新图片列表
    updateImageList();
}

// 更新图片列表显示
function updateImageList() {
    const startIndex = (currentPage - 1) * imagesPerPage;
    const endIndex = startIndex + imagesPerPage;
    const currentImages = processedImagesList.slice(startIndex, endIndex);

    // 清空当前显示
    imageListContainer.innerHTML = '';

    // 创建图片网格
    const gridContainer = document.createElement('div');
    gridContainer.className = 'image-grid';
    
    // 添加每张图片
    currentImages.forEach((imageData, index) => {
        const imageCard = document.createElement('div');
        imageCard.className = 'image-card';
        
        // 创建画布显示图片和检测结果
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // 加载图片
        const img = new Image();
        img.onload = () => {
            // 计算合适的画布尺寸，保持原始比例
            const maxSize = 200;
            let targetWidth, targetHeight;
            let scale;
            
            if (img.width > img.height) {
                targetWidth = maxSize;
                scale = maxSize / img.width;
                targetHeight = Math.round(img.height * scale);
            } else {
                targetHeight = maxSize;
                scale = maxSize / img.height;
                targetWidth = Math.round(img.width * scale);
            }
            
            // 设置画布尺寸
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            
            // 清除画布
            ctx.clearRect(0, 0, targetWidth, targetHeight);
            
            // 绘制图片
            ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
            
            // 如果有NFC位置信息，绘制检测框
            if (imageData.result && imageData.result.nfcLocation) {
                const nfc = imageData.result.nfcLocation;
                
                // 绘制设备边界（使用蓝色）
                ctx.strokeStyle = '#0066FF';
                ctx.lineWidth = 2;
                const deviceBounds = detectDeviceBounds(
                    ctx.getImageData(0, 0, targetWidth, targetHeight),
                    targetWidth,
                    targetHeight
                );
                
                ctx.strokeRect(
                    deviceBounds.x,
                    deviceBounds.y,
                    deviceBounds.width,
                    deviceBounds.height
                );
                
                // 根据缩放比例调整NFC区域的坐标和尺寸
                const scaledLeft = Math.round(nfc.left * scale);
                const scaledTop = Math.round(nfc.top * scale);
                const scaledWidth = Math.round(nfc.width * scale);
                const scaledHeight = Math.round(nfc.height * scale);
                
                // 绘制NFC区域（使用黄色）
                ctx.strokeStyle = '#FFD700';
                ctx.lineWidth = 2;
                ctx.strokeRect(
                    deviceBounds.x + scaledLeft,
                    deviceBounds.y + scaledTop,
                    scaledWidth,
                    scaledHeight
                );

                // 添加图例说明（更新颜色）
                ctx.font = '12px Arial';
                ctx.fillStyle = '#0066FF';
                ctx.fillText('设备边界', 5, 15);
                ctx.fillStyle = '#FFD700';
                ctx.fillText('NFC区域', 5, 30);
            }
        };
        img.src = imageData.imageUrl;
        
        // 添加图片信息
        const infoDiv = document.createElement('div');
        infoDiv.className = 'image-info';
        infoDiv.innerHTML = `
            <p>文件名: ${imageData.name}</p>
            ${imageData.result ? 
                `<p>检测状态: 成功</p>
                 <p>设备尺寸: ${imageData.result.nfcLocation.deviceWidth} x ${imageData.result.nfcLocation.deviceHeight}</p>
                 <p>NFC位置: (${Math.round(imageData.result.nfcLocation.left)}, ${Math.round(imageData.result.nfcLocation.top)})</p>
                 <p>NFC尺寸: ${Math.round(imageData.result.nfcLocation.width)} x ${Math.round(imageData.result.nfcLocation.height)}</p>` : 
                `<p class="error">检测状态: 失败</p>`
            }
        `;
        
        imageCard.appendChild(canvas);
        imageCard.appendChild(infoDiv);
        gridContainer.appendChild(imageCard);
    });
    
    imageListContainer.appendChild(gridContainer);
    
    // 更新分页
    updatePagination();
}

// 更新分页控件
function updatePagination() {
    const totalPages = Math.ceil(processedImagesList.length / imagesPerPage);
    
    paginationContainer.innerHTML = `
        <button ${currentPage === 1 ? 'disabled' : ''} onclick="changePage(1)">首页</button>
        <button ${currentPage === 1 ? 'disabled' : ''} onclick="changePage(${currentPage - 1})">上一页</button>
        <span>第 ${currentPage}/${totalPages} 页</span>
        <button ${currentPage === totalPages ? 'disabled' : ''} onclick="changePage(${currentPage + 1})">下一页</button>
        <button ${currentPage === totalPages ? 'disabled' : ''} onclick="changePage(${totalPages})">末页</button>
    `;
}

// 切换页面
function changePage(page) {
    currentPage = page;
    updateImageList();
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
        // 设置canvas尺寸为原始图片尺寸
        previewCanvas.width = image.width;
        previewCanvas.height = image.height;
        previewCanvas.style.display = 'block';
        placeholder.style.display = 'none';

        // 绘制原图
        ctx.drawImage(image, 0, 0);

        // 如果有设备边界信息，绘制边界框
        if (img.data) {
            const deviceBounds = detectDeviceBounds(
                ctx.getImageData(0, 0, image.width, image.height),
                image.width,
                image.height
            );

            // 绘制设备边界（使用蓝色）
            ctx.strokeStyle = '#0066FF';
            ctx.lineWidth = 2;
            ctx.strokeRect(
                deviceBounds.x,
                deviceBounds.y,
                deviceBounds.width,
                deviceBounds.height
            );

            // 绘制NFC区域（使用黄色）
            ctx.strokeStyle = '#FFD700';
            ctx.lineWidth = 2;
            const nfcLeft = img.data.left || img.data.nfcLeft;
            const nfcTop = img.data.top || img.data.nfcTop;
            const nfcWidth = img.data.width || img.data.nfcWidth;
            const nfcHeight = img.data.height || img.data.nfcHeight;
            
            ctx.strokeRect(nfcLeft, nfcTop, nfcWidth, nfcHeight);

            // 添加图例说明（更新颜色）
            ctx.font = '14px Arial';
            ctx.fillStyle = '#0066FF';
            ctx.fillText('设备边界', 10, 20);
            ctx.fillStyle = '#FFD700';
            ctx.fillText('NFC区域', 10, 40);
        }
    };
    image.src = img.imageData;
} 