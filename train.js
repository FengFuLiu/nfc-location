// 训练相关的DOM元素
const trainingDataInput = document.getElementById('trainingDataInput');
const datasetCount = document.getElementById('datasetCount');
const startTrainBtn = document.getElementById('startTrainBtn');
const stopTrainBtn = document.getElementById('stopTrainBtn');
const exportModelBtn = document.getElementById('exportModelBtn');
const currentEpoch = document.getElementById('currentEpoch');
const trainLoss = document.getElementById('trainLoss');
const valAccuracy = document.getElementById('valAccuracy');

// 添加日志控制开关
const DEBUG_MODE = {
  enabled: false,  // 默认关闭详细日志
  logs: [],       // 存储日志
  maxSizeInBytes: 1024 * 1024, // 1MB 限制
  currentSizeInBytes: 0,      // 当前日志大小
  
  log: function(...args) {
    // 将日志转换为字符串并存储
    const logString = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      message: logString
    };
    
    // 计算新日志条目的大小（以字节为单位）
    const logSize = new TextEncoder().encode(JSON.stringify(logEntry)).length;
    
    // 如果添加新日志会超过大小限制，则移除最旧的日志直到有足够空间
    while (this.currentSizeInBytes + logSize > this.maxSizeInBytes && this.logs.length > 0) {
      const oldestLog = this.logs.shift();
      this.currentSizeInBytes -= new TextEncoder().encode(JSON.stringify(oldestLog)).length;
    }
    
    // 如果单条日志就超过了限制，则截断消息
    if (logSize > this.maxSizeInBytes) {
      logEntry.message = logEntry.message.substring(0, Math.floor(this.maxSizeInBytes / 2)) + 
        "\n... [日志已截断，超出大小限制] ...";
      const truncatedSize = new TextEncoder().encode(JSON.stringify(logEntry)).length;
      if (truncatedSize <= this.maxSizeInBytes) {
        this.logs.push(logEntry);
        this.currentSizeInBytes = truncatedSize;
      }
    } else {
      // 添加新日志
      this.logs.push(logEntry);
      this.currentSizeInBytes += logSize;
    }
    
    if (this.enabled) {
      console.log(...args);
    }
  },
  
  clearLogs: function() {
    this.logs = [];
    this.currentSizeInBytes = 0;
  },
  
  downloadLogs: function() {
    const logText = this.logs.map(log => 
      `[${log.timestamp}] ${log.message}`
    ).join('\n');
    
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'training-logs.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
};

// 添加调试开关按钮和下载日志按钮
const toggleDebugBtn = document.createElement('button');
toggleDebugBtn.textContent = '开启调试日志';
toggleDebugBtn.onclick = () => {
  DEBUG_MODE.enabled = !DEBUG_MODE.enabled;
  toggleDebugBtn.textContent = DEBUG_MODE.enabled ? '关闭调试日志' : '开启调试日志';
};

const downloadLogsBtn = document.createElement('button');
downloadLogsBtn.textContent = '下载训练日志';
downloadLogsBtn.onclick = () => {
  DEBUG_MODE.downloadLogs();
};

// 将按钮添加到 startTrainBtn 的父元素中
startTrainBtn.parentElement.insertBefore(toggleDebugBtn, startTrainBtn.nextSibling);
startTrainBtn.parentElement.insertBefore(downloadLogsBtn, toggleDebugBtn.nextSibling);

// 设置为使用 WebGL 后端以启用GPU加速
tf.setBackend('webgl');
DEBUG_MODE.log('当前使用的后端:', tf.getBackend());

// 训练数据
let trainingData = {
  images: [], // 存储预处理后的图片张量
  labels: [], // 存储NFC区域坐标 [x, y, width, height]
};

let model = null;
let isTraining = false;

// 初始化图表
const trainingChartCanvas = document.getElementById('trainingChart');
const trainingChartCtx = trainingChartCanvas.getContext('2d');
const chart = new Chart(trainingChartCtx, {
  type: 'line',
  data: {
    labels: [],
    datasets: [
      {
        label: '训练损失',
        data: [],
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1
      },
      {
        label: '验证准确率',
        data: [],
        borderColor: 'rgb(255, 99, 132)',
        tension: 0.1
      }
    ]
  },
  options: {
    responsive: true,
    scales: {
      y: {
        beginAtZero: true
      }
    }
  }
});

// 加载标注文件
async function loadAnnotations(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const annotations = JSON.parse(e.target.result);
        resolve(annotations);
      } catch (err) {
        reject(new Error('标注文件格式错误'));
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

// 处理数据集上传
trainingDataInput.addEventListener('change', async (e) => {
  console.log('文件选择事件触发');
  try {
    const files = Array.from(e.target.files);
    
    // 查找标注文件（应该是一个JSON文件）
    const annotationFile = files.find(file => file.name === 'annotations.json');
    if (!annotationFile) {
      alert('请选择包含 annotations.json 标注文件的文件夹');
      return;
    }

    // 读取标注文件
    const annotations = await loadAnnotations(annotationFile);
    console.log('加载到标注数据:', annotations);
    
    // 验证标注数据格式
    if (!annotations.images || !Array.isArray(annotations.images)) {
      console.error('标注数据格式错误：缺少images数组');
      alert('标注数据格式错误');
      return;
    }

    // 检查标注数据的值范围
    annotations.images.forEach((img, index) => {
      DEBUG_MODE.log(`检查第${index + 1}个标注数据:`, {
        文件名: img.file_name,
        标注框: img.annotations,
        x范围: img.annotations.x >= 0 && img.annotations.x <= 1 ? '正常' : '异常',
        y范围: img.annotations.y >= 0 && img.annotations.y <= 1 ? '正常' : '异常',
        宽度范围: img.annotations.width >= 0 && img.annotations.width <= 1 ? '正常' : '异常',
        高度范围: img.annotations.height >= 0 && img.annotations.height <= 1 ? '正常' : '异常'
      });
    });

    // 过滤出图片文件
    const imageFiles = files.filter(file => 
      file.type.startsWith('image/')
    );

    if (imageFiles.length === 0) {
      alert('未找到有效的图片文件');
      return;
    }

    DEBUG_MODE.log(`找到 ${imageFiles.length} 个图片文件:`, 
      imageFiles.map(f => ({
        文件名: f.name,
        大小: (f.size / 1024).toFixed(2) + 'KB',
        类型: f.type
      }))
    );

    datasetCount.textContent = '正在加载数据集...';
    startTrainBtn.disabled = true;

    // 清空现有数据
    trainingData.images = [];
    trainingData.labels = [];
    
    // 分批处理图片，每批最多10张
    const batchSize = 10;
    for (let i = 0; i < imageFiles.length; i += batchSize) {
      const batch = imageFiles.slice(i, i + batchSize);
      
      // 处理这一批的图片
      for (const file of batch) {
        try {
          // 查找对应的标注数据
          const annotation = annotations.images.find(img => img.file_name === file.name);
          if (!annotation) {
            console.warn(`未找到图片 ${file.name} 的标注数据，跳过`);
            continue;
          }

          // 处理图片
          const tensor = await preprocessImage(file);
          
          // 验证图片张量
          DEBUG_MODE.log(`图片 ${file.name} 预处理结果:`, {
            张量形状: tensor.shape,
            数值范围: {
              最小值: tensor.min().dataSync()[0],
              最大值: tensor.max().dataSync()[0]
            }
          });

          trainingData.images.push(tensor);
          
          // 使用标注数据中的坐标
          const label = [
            annotation.annotations.x,
            annotation.annotations.y,
            annotation.annotations.width,
            annotation.annotations.height
          ];
          
          // 验证标签值
          DEBUG_MODE.log(`图片 ${file.name} 的标签值:`, {
            rawValue: label,
            x: label[0],
            y: label[1],
            width: label[2],
            height: label[3],
            isInRange: label.every(v => v >= 0 && v <= 1)
          });
          
          trainingData.labels.push(label);
          
          // 更新进度
          datasetCount.textContent = `已加载 ${trainingData.images.length} 个样本，共 ${imageFiles.length} 个`;
        } catch (err) {
          DEBUG_MODE.log(`处理文件 ${file.name} 时出错:`, err);
          console.error(`处理文件 ${file.name} 时出错`);
        }
      }
      
      // 等待一小段时间，让浏览器有机会进行垃圾回收
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // 数据集统计信息
    DEBUG_MODE.log('数据集统计信息:', {
      totalSamples: trainingData.images.length,
      imageSize: [224, 224, 3],
      labelStats: {
        x: {
          min: Math.min(...trainingData.labels.map(l => l[0])),
          max: Math.max(...trainingData.labels.map(l => l[0])),
          avg: trainingData.labels.reduce((sum, l) => sum + l[0], 0) / trainingData.labels.length
        },
        y: {
          min: Math.min(...trainingData.labels.map(l => l[1])),
          max: Math.max(...trainingData.labels.map(l => l[1])),
          avg: trainingData.labels.reduce((sum, l) => sum + l[1], 0) / trainingData.labels.length
        },
        width: {
          min: Math.min(...trainingData.labels.map(l => l[2])),
          max: Math.max(...trainingData.labels.map(l => l[2])),
          avg: trainingData.labels.reduce((sum, l) => sum + l[2], 0) / trainingData.labels.length
        },
        height: {
          min: Math.min(...trainingData.labels.map(l => l[3])),
          max: Math.max(...trainingData.labels.map(l => l[3])),
          avg: trainingData.labels.reduce((sum, l) => sum + l[3], 0) / trainingData.labels.length
        }
      }
    });
      
    startTrainBtn.disabled = false;
  } catch (err) {
    DEBUG_MODE.log('加载数据集时出错:', err);
    console.error('加载数据集时出错');
    alert('加载数据集时出错，请检查控制台获取详细信息');
  }
});

// 图片预处理函数
async function preprocessImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = async () => {
      try {
        // 创建canvas用于图片处理
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // 保持原始宽高比的情况下调整尺寸
        const maxSize = 224;
        let targetWidth, targetHeight;
        
        if (img.width > img.height) {
          targetWidth = maxSize;
          targetHeight = Math.round((maxSize * img.height) / img.width);
        } else {
          targetHeight = maxSize;
          targetWidth = Math.round((maxSize * img.width) / img.height);
        }
        
        // 设置canvas尺寸为目标尺寸
        canvas.width = targetWidth;
        canvas.height = targetHeight;

        // 数据增强：随机变换
        ctx.save();  // 保存当前状态

        // 1. 随机水平翻转 (50%概率)
        const doFlip = Math.random() > 0.5;
        if (doFlip) {
          ctx.translate(targetWidth, 0);
          ctx.scale(-1, 1);
          DEBUG_MODE.log('应用水平翻转');
        }

        // 2. 随机旋转 (±15度)
        const rotation = (Math.random() * 30 - 15) * Math.PI / 180;
        ctx.translate(targetWidth/2, targetHeight/2);
        ctx.rotate(rotation);
        ctx.translate(-targetWidth/2, -targetHeight/2);
        DEBUG_MODE.log('应用旋转:', (rotation * 180 / Math.PI).toFixed(2) + '度');

        // 3. 随机亮度调整 (±20%)
        const brightness = 0.8 + Math.random() * 0.4;
        ctx.filter = `brightness(${brightness})`;
        DEBUG_MODE.log('应用亮度调整:', brightness.toFixed(2));

        // 绘制调整后的图片
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        ctx.restore();  // 恢复到保存的状态

        // 4. 添加随机噪声
        const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
        const noise = 15;  // 噪声强度
        for (let i = 0; i < imageData.data.length; i += 4) {
          const randomNoise = (Math.random() * 2 - 1) * noise;
          imageData.data[i] = Math.min(255, Math.max(0, imageData.data[i] + randomNoise));     // R
          imageData.data[i+1] = Math.min(255, Math.max(0, imageData.data[i+1] + randomNoise)); // G
          imageData.data[i+2] = Math.min(255, Math.max(0, imageData.data[i+2] + randomNoise)); // B
        }
        ctx.putImageData(imageData, 0, 0);
        DEBUG_MODE.log('应用随机噪声');
        
        // 创建填充后的张量
        const tensor = tf.tidy(() => {
          // 首先将图像转换为张量，并直接归一化到[-1,1]范围
          const imageTensor = tf.browser.fromPixels(canvas)
            .toFloat()
            .div(127.5)
            .sub(1);  // 直接归一化到[-1,1]范围
          
          // 创建填充张量
          const paddedTensor = tf.zeros([224, 224, 3]);
          
          // 计算填充位置
          const offsetX = Math.floor((224 - targetWidth) / 2);
          const offsetY = Math.floor((224 - targetHeight) / 2);
          
          // 将图像张量放置在填充张量的中心
          return tf.tidy(() => {
            // 创建一个完整的224x224x3的零张量
            const fullTensor = tf.zeros([224, 224, 3]);
            
            // 使用tf.slice和tf.add来将图像放在中心位置
            const updates = fullTensor.bufferSync();
            const imageBuffer = imageTensor.bufferSync();
            
            // 复制图像数据到中心位置
            for (let y = 0; y < targetHeight; y++) {
              for (let x = 0; x < targetWidth; x++) {
                for (let c = 0; c < 3; c++) {
                  updates.set(imageBuffer.get(y, x, c), y + offsetY, x + offsetX, c);
                }
              }
            }
            
            return tf.tensor(updates.values, [1, 224, 224, 3]);
          });
        });

        // 记录数据增强的结果
        DEBUG_MODE.log('数据增强后的张量信息:', {
          shape: tensor.shape,
          min: tensor.min().dataSync()[0],
          max: tensor.max().dataSync()[0]
        });
        
        resolve(tensor);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// 添加复合损失函数（Huber + IoU）
function weightedHuberIoULoss(weights) {
  return (yTrue, yPred) => tf.tidy(() => {
    // 打印输入张量的值和形状
    DEBUG_MODE.log('损失函数输入:', {
      yTrue: {
        shape: yTrue.shape,
        values: yTrue.dataSync(),
      },
      yPred: {
        shape: yPred.shape,
        values: yPred.dataSync(),
      }
    });

    // Huber损失
    const huberLoss = tf.losses.huberLoss(yTrue, yPred);
    const huberValue = huberLoss.dataSync()[0];
    DEBUG_MODE.log('Huber损失值:', huberValue);
    
    // IoU损失
    const [x1, y1, w1, h1] = tf.split(yTrue, 4, 1);
    const [x2, y2, w2, h2] = tf.split(yPred, 4, 1);
    
    // 打印分割后的坐标值
    DEBUG_MODE.log('真实框坐标:', {
      x: x1.dataSync()[0],
      y: y1.dataSync()[0],
      w: w1.dataSync()[0],
      h: h1.dataSync()[0]
    });
    DEBUG_MODE.log('预测框坐标:', {
      x: x2.dataSync()[0],
      y: y2.dataSync()[0],
      w: w2.dataSync()[0],
      h: h2.dataSync()[0]
    });
    
    const xMin = tf.maximum(x1.sub(w1.div(2)), x2.sub(w2.div(2)));
    const yMin = tf.maximum(y1.sub(h1.div(2)), y2.sub(h2.div(2)));
    const xMax = tf.minimum(x1.add(w1.div(2)), x2.add(w2.div(2)));
    const yMax = tf.minimum(y1.add(h1.div(2)), y2.add(h2.div(2)));
    
    // 打印边界框计算结果
    DEBUG_MODE.log('边界框计算:', {
      xMin: xMin.dataSync()[0],
      yMin: yMin.dataSync()[0],
      xMax: xMax.dataSync()[0],
      yMax: yMax.dataSync()[0]
    });
    
    const intersection = tf.maximum(xMax.sub(xMin), 0).mul(tf.maximum(yMax.sub(yMin), 0));
    const area1 = w1.mul(h1);
    const area2 = w2.mul(h2);
    const union = tf.sub(tf.add(area1, area2), intersection);
    
    // 打印面积计算结果
    DEBUG_MODE.log('面积计算:', {
      intersection: intersection.dataSync()[0],
      area1: area1.dataSync()[0],
      area2: area2.dataSync()[0],
      union: union.dataSync()[0]
    });
    
    const iou = intersection.div(tf.add(union, 1e-7));
    const iouLoss = tf.sub(1, iou);
    const iouValue = iouLoss.dataSync()[0];
    DEBUG_MODE.log('IoU损失值:', iouValue);

    const finalLoss = tf.add(
      tf.mul(weights.box, huberLoss),
      tf.mul(weights.iou, iouLoss)
    );
    
    const finalLossValue = finalLoss.dataSync()[0];
    DEBUG_MODE.log('最终损失值:', finalLossValue);

    return finalLoss;
  });
}

// 创建模型（使用 MobileNet 迁移学习）
async function createModel() {
  // 加载 MobileNet 作为基础模型（去掉顶层）
  const mobilenet = await tf.loadLayersModel('https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_0.25_224/model.json');
  const layer = mobilenet.getLayer('conv_pw_13_relu');
  const baseModel = tf.model({
    inputs: mobilenet.inputs,
    outputs: layer.output
  });
  baseModel.trainable = false;

  const model = tf.sequential({
    layers: [
      tf.layers.inputLayer({ inputShape: [224, 224, 3] }),
      baseModel,
      // 添加空间金字塔池化
      tf.layers.conv2d({ filters: 256, kernelSize: 3, padding: 'same', activation: 'relu' }),
      tf.layers.maxPooling2d({ poolSize: 2, padding: 'same' }),
      tf.layers.conv2d({ filters: 128, kernelSize: 3, padding: 'same', activation: 'relu' }),
      // 使用全局上下文信息
      tf.layers.globalAveragePooling2d({ dataFormat: 'channelsLast' }),
      tf.layers.dense({ units: 64, activation: 'relu' }),
      // 输出层使用线性激活（配合归一化处理）
      tf.layers.dense({ units: 4, activation: 'linear' })
    ]
  });

  // 使用复合损失函数
  const lossWeights = { box: 1.0, iou: 0.7 };
  const optimizer = tf.train.adam(0.001);
  
  model.compile({
    optimizer: optimizer,
    loss: weightedHuberIoULoss(lossWeights),
    metrics: ['mse']
  });

  return model;
}

// 开始训练
startTrainBtn.addEventListener('click', async () => {
  DEBUG_MODE.clearLogs();  // 清空之前的日志
  DEBUG_MODE.enabled = true;  // 强制开启日志
  if (!model) {
    model = await createModel();
    DEBUG_MODE.log('模型结构:', model.summary());
  }
  
  isTraining = true;
  startTrainBtn.disabled = true;
  stopTrainBtn.disabled = false;
  
  try {
    // 增加批次大小以提高训练效率
    const trainBatchSize = 4;
    const totalEpochs = 50;
    
    // 清空图表数据
    chart.data.labels = [];
    chart.data.datasets[0].data = [];
    chart.data.datasets[1].data = [];
    chart.update();

    // 将数据分成小批次处理
    const totalImages = trainingData.images.length;
    
    for (let epoch = 0; epoch < totalEpochs && isTraining; epoch++) {
      let totalLoss = 0;
      let totalAccuracy = 0;
      let batchCount = 0;
      
      // 一次处理一个样本
      for (let i = 0; i < totalImages && isTraining; i++) {
        const image = trainingData.images[i];
        const label = trainingData.labels[i];
        
        DEBUG_MODE.log(`\n开始训练第 ${epoch + 1} 轮，第 ${i + 1} 个样本`);
        DEBUG_MODE.log('输入图像形状:', image.shape);
        DEBUG_MODE.log('标签值:', label);
        
        // 创建输入张量
        const xs = image;
        const ys = tf.tensor2d([label]);
        
        try {
          // 训练前打印张量信息
          DEBUG_MODE.log('训练输入:', {
            xs: {
              shape: xs.shape,
              min: xs.min().dataSync()[0],
              max: xs.max().dataSync()[0]
            },
            ys: {
              shape: ys.shape,
              values: ys.dataSync()
            }
          });
          
          // 训练单个样本
          const result = await model.trainOnBatch(xs, ys);
          const loss = Array.isArray(result) ? result[0] : result;
          
          // 计算准确率
          const prediction = model.predict(xs);
          const predictedBox = prediction.dataSync();  // 直接使用预测值，不需要额外归一化
          
          // 打印预测结果
          DEBUG_MODE.log('预测结果:', {
            预测框: predictedBox,
            实际框: label,
            损失值: loss,
            归一化后的预测框: Array.from(predictedBox).map(v => v.toFixed(4))
          });
          
          // 计算IoU作为准确率指标
          const accuracy = await tf.tidy(() => {
            // 计算边界框的坐标
            const [x1, y1, w1, h1] = tf.split(ys, 4, 1);
            const [x2, y2, w2, h2] = tf.split(prediction, 4, 1);  // 直接使用prediction
            
            // 打印IoU计算的中间值
            const box1 = {
              x: x1.dataSync()[0],
              y: y1.dataSync()[0],
              w: w1.dataSync()[0],
              h: h1.dataSync()[0]
            };
            const box2 = {
              x: x2.dataSync()[0],
              y: y2.dataSync()[0],
              w: w2.dataSync()[0],
              h: h2.dataSync()[0]
            };
            DEBUG_MODE.log('IoU计算的边界框:', {
              实际框: box1,
              预测框: box2
            });
            
            const box1_x2 = tf.add(x1, w1);
            const box1_y2 = tf.add(y1, h1);
            const box2_x2 = tf.add(x2, w2);
            const box2_y2 = tf.add(y2, h2);
            
            // 计算交集
            const intersect_x1 = tf.maximum(x1, x2);
            const intersect_y1 = tf.maximum(y1, y2);
            const intersect_x2 = tf.minimum(box1_x2, box2_x2);
            const intersect_y2 = tf.minimum(box1_y2, box2_y2);
            
            const intersect_w = tf.maximum(tf.sub(intersect_x2, intersect_x1), 0);
            const intersect_h = tf.maximum(tf.sub(intersect_y2, intersect_y1), 0);
            const intersection = tf.mul(intersect_w, intersect_h);
            
            // 计算各自的面积
            const area1 = tf.mul(w1, h1);
            const area2 = tf.mul(w2, h2);
            
            // 计算并集
            const union = tf.sub(tf.add(area1, area2), intersection);
            
            // 计算IoU
            const iou = tf.div(intersection, tf.maximum(union, 1e-7));
            
            // 打印IoU计算的结果
            const iouValue = iou.dataSync()[0];
            DEBUG_MODE.log('IoU计算结果:', {
              交集面积: intersection.dataSync()[0],
              并集面积: union.dataSync()[0],
              IoU值: iouValue
            });
            
            return iou.dataSync()[0];
          });
          
          totalLoss += loss;
          totalAccuracy += accuracy;
          batchCount++;
          
          // 更新进度
          currentEpoch.textContent = `第 ${epoch + 1}/${totalEpochs} 轮，样本 ${i + 1}/${totalImages}`;
          trainLoss.textContent = loss.toFixed(4);
          valAccuracy.textContent = (accuracy * 100).toFixed(2) + '%';
          
          // 清理预测张量
          prediction.dispose();
          
          await new Promise(resolve => setTimeout(resolve, 50));
        } catch (err) {
          DEBUG_MODE.log('训练样本时出错:', err);
          throw err;
        } finally {
          ys.dispose();
        }
      }
      
      // 计算平均损失和准确率
      const avgLoss = totalLoss / batchCount;
      const avgAccuracy = totalAccuracy / batchCount;
      
      DEBUG_MODE.log(`\n轮次 ${epoch + 1} 统计:`, {
        平均损失: avgLoss,
        平均准确率: avgAccuracy,
        样本数: batchCount
      });
      
      // 更新图表
      chart.data.labels.push(epoch + 1);
      chart.data.datasets[0].data.push(avgLoss);
      chart.data.datasets[1].data.push(avgAccuracy);
      chart.update();
      
      if (!isTraining) break;
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    exportModelBtn.disabled = false;
    alert('训练完成！');
  } catch (err) {
    DEBUG_MODE.log('训练过程中出错:', err);
    console.error('训练过程中出错:', err);
    alert('训练过程中出错，请查看控制台获取详细信息');
  } finally {
    isTraining = false;
    startTrainBtn.disabled = false;
    stopTrainBtn.disabled = true;
  }
});

// 停止训练
stopTrainBtn.addEventListener('click', () => {
  isTraining = false;
  startTrainBtn.disabled = false;
  stopTrainBtn.disabled = true;
});

// 导出模型
exportModelBtn.addEventListener('click', async () => {
  if (!model) {
    alert('请先训练模型');
    return;
  }

  try {
    // 创建一个 JSZip 实例
    const zip = new JSZip();
    
    // 保存模型架构和权重
    const modelSave = await model.save(tf.io.withSaveHandler(async (modelArtifacts) => {
      // 确保包含权重规格
      const weightSpecs = model.weights.map(weight => ({
        name: weight.name,
        shape: weight.shape,
        dtype: weight.dtype
      }));
      
      // 构建完整的模型拓扑
      const fullModelTopology = {
        ...modelArtifacts.modelTopology,
        weightsManifest: [{
          paths: ['nfc-detector-model.weights.bin'],
          weights: weightSpecs
        }]
      };
      
      // 保存完整的模型架构
      zip.file("model.json", JSON.stringify(fullModelTopology));
      
      // 保存权重
      const weightData = modelArtifacts.weightData;
      const weightBlob = new Blob([weightData], {type: 'application/octet-stream'});
      zip.file("nfc-detector-model.weights.bin", weightBlob);
      
      return modelArtifacts;
    }));

    // 生成并下载 zip 文件
    const content = await zip.generateAsync({type: "blob"});
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nfc-detector-model.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    alert('模型导出成功！');
  } catch (error) {
    DEBUG_MODE.log('导出模型失败:', error);
    console.error('导出模型失败');
    alert('导出模型失败，请查看控制台了解详情');
  }
}); 