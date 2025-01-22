// 训练相关的DOM元素
const trainingDataInput = document.getElementById('trainingDataInput');
const datasetCount = document.getElementById('datasetCount');
const startTrainBtn = document.getElementById('startTrainBtn');
const stopTrainBtn = document.getElementById('stopTrainBtn');
const exportModelBtn = document.getElementById('exportModelBtn');
const currentEpoch = document.getElementById('currentEpoch');
const trainLoss = document.getElementById('trainLoss');
const valAccuracy = document.getElementById('valAccuracy');

// 设置为使用 CPU 后端
tf.setBackend('cpu');
console.log('当前使用的后端:', tf.getBackend());

// 添加初始化日志
console.log('训练脚本已加载');
console.log('DOM元素状态:', {
  trainingDataInput: !!trainingDataInput,
  datasetCount: !!datasetCount,
  startTrainBtn: !!startTrainBtn,
  stopTrainBtn: !!stopTrainBtn,
  exportModelBtn: !!exportModelBtn,
  currentEpoch: !!currentEpoch,
  trainLoss: !!trainLoss,
  valAccuracy: !!valAccuracy
});

// 训练配置
const epochsInput = document.getElementById('epochs') || { value: '50' };
const batchSizeInput = document.getElementById('batchSize') || { value: '32' };
const learningRateInput = document.getElementById('learningRate') || { value: '0.001' };

// 训练数据
let trainingData = {
  images: [], // 存储预处理后的图片张量
  labels: [], // 存储NFC区域坐标 [x, y, width, height]
  annotations: null // COCO格式的标注数据
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

// 图片预处理
async function preprocessImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = async () => {
      try {
        // 创建canvas用于图片处理
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        
        // 绘制原始图片
        ctx.drawImage(img, 0, 0);
        
        // 获取图片数据
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // 检测标记框（支持多种颜色）
        let nfcBox = null;
        let boxColor = null;
        
        // 扫描图片像素寻找标记框
        for (let y = 0; y < canvas.height; y++) {
          for (let x = 0; x < canvas.width; x++) {
            const i = (y * canvas.width + x) * 4;
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];
            
            // 计算颜色的亮度和饱和度
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const lightness = (max + min) / 2;
            const saturation = max === min ? 0 : (max - min) / (lightness > 0.5 ? (2 - max - min) : (max + min));
            
            // 检查是否是标记框的颜色
            const isColoredBox = (
              // 红色: 高红色值，低绿蓝值
              (r > 150 && g < 100 && b < 100) ||
              // 绿色: 高绿色值，低红蓝值
              (r < 100 && g > 150 && b < 100) ||
              // 蓝色: 高蓝色值，低红绿值
              (r < 100 && g < 100 && b > 150) ||
              // 黄色: 高红绿值，低蓝值
              (r > 150 && g > 150 && b < 100) ||
              // 白色: 高亮度，低饱和度
              (lightness > 200 && saturation < 0.2) ||
              // 其他高对比度颜色
              (Math.abs(r - g) > 50 || Math.abs(r - b) > 50 || Math.abs(g - b) > 50)
            );
            
            if (isColoredBox && a > 200) { // 确保不是透明像素
              // 找到标记框的边界
              if (!nfcBox) {
                nfcBox = {minX: x, minY: y, maxX: x, maxY: y};
                boxColor = {r, g, b};
              } else {
                nfcBox.minX = Math.min(nfcBox.minX, x);
                nfcBox.minY = Math.min(nfcBox.minY, y);
                nfcBox.maxX = Math.max(nfcBox.maxX, x);
                nfcBox.maxY = Math.max(nfcBox.maxY, y);
              }
            }
          }
        }
        
        if (!nfcBox) {
          // 如果没有找到标记框，尝试在控制台显示更多信息
          console.warn(`未在图片中找到标记框: ${file.name}，请确保标记框颜色足够明显`);
          throw new Error(`未在图片中找到标记框: ${file.name}`);
        }
        
        // 计算标记框的位置和大小
        const width = nfcBox.maxX - nfcBox.minX;
        const height = nfcBox.maxY - nfcBox.minY;
        
        // 验证标记框大小是否合理
        const minSize = 10; // 最小像素大小
        if (width < minSize || height < minSize) {
          throw new Error(`标记框太小，可能是噪点: ${file.name}`);
        }
        
        // 归一化坐标（转换为0-1范围）
        const normalizedBox = {
          x: nfcBox.minX / canvas.width,
          y: nfcBox.minY / canvas.height,
          width: width / canvas.width,
          height: height / canvas.height
        };
        
        // 调整图片大小为模型输入尺寸
        const tensor = tf.browser.fromPixels(img)
          .resizeBilinear([224, 224])
          .toFloat()
          .div(255.0)
          .expandDims();
          
        resolve({
          tensor: tensor,
          box: [normalizedBox.x, normalizedBox.y, normalizedBox.width, normalizedBox.height]
        });
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// 从文件名解析标签信息
function parseLabel(filename) {
  // 假设文件名格式为: "x_y_w_h.jpg"
  // 例如: "100_200_50_30.jpg" 表示 NFC 区域在 (100,200) 位置，宽50像素，高30像素
  const parts = filename.split('.')[0].split('_');
  if (parts.length !== 4) {
    throw new Error(`文件名格式错误: ${filename}`);
  }
  return parts.map(Number);
}

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
    const imageFiles = files.filter(file => 
      file.type.startsWith('image/')
    );

    if (imageFiles.length === 0) {
      alert('未找到有效的图片文件');
      return;
    }

    console.log(`找到 ${imageFiles.length} 个图片文件`);
    datasetCount.textContent = '正在加载...';
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
          const {tensor, box} = await preprocessImage(file);
          trainingData.images.push(tensor);
          trainingData.labels.push(box);
          
          // 更新进度
          datasetCount.textContent = `已加载: ${trainingData.images.length}/${imageFiles.length}张图片`;
        } catch (err) {
          console.warn(`处理文件 ${file.name} 时出错:`, err);
        }
      }
      
      // 等待一小段时间，让浏览器有机会进行垃圾回收
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // 更新界面
    if (trainingData.images.length > 0) {
      startTrainBtn.disabled = false;
      console.log('数据集加载完成:', {
        总样本数: trainingData.images.length,
        图片尺寸: [224, 224, 3],
        标签示例: trainingData.labels[0]
      });
    } else {
      alert('没有成功加载任何训练数据，请检查图片是否包含有效的标记框');
    }

  } catch (err) {
    console.error('加载数据集时出错:', err);
    alert('加载数据集时出错，请检查控制台获取详细信息');
  }
});

// 创建模型
function createModel() {
  const model = tf.sequential();
  
  // 使用更简单的网络结构，适合 CPU 运算
  model.add(tf.layers.conv2d({
    inputShape: [224, 224, 3],
    filters: 8,
    kernelSize: 5,
    strides: 4,
    activation: 'relu',
    kernelInitializer: 'heNormal'
  }));
  
  model.add(tf.layers.maxPooling2d({poolSize: 4}));
  
  model.add(tf.layers.flatten());
  model.add(tf.layers.dense({
    units: 16,
    activation: 'relu',
    kernelInitializer: 'heNormal'
  }));
  model.add(tf.layers.dense({
    units: 4,
    kernelInitializer: 'heNormal'
  }));
  
  return model;
}

// 开始训练
startTrainBtn.addEventListener('click', async () => {
  if (!model) {
    model = createModel();
  }
  
  const optimizer = tf.train.adam(learningRateInput.value);
  model.compile({
    optimizer: optimizer,
    loss: 'meanSquaredError',
    metrics: ['mse']  // 使用均方误差作为评估指标
  });
  
  isTraining = true;
  startTrainBtn.disabled = true;
  stopTrainBtn.disabled = false;
  
  try {
    // 使用更小的批次大小和更少的训练轮数
    const trainBatchSize = 1; // 单个样本训练
    const totalEpochs = Math.min(parseInt(epochsInput.value), 10); // 限制最大训练轮数
    
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
        
        // 创建输入张量
        const xs = image;
        const ys = tf.tensor2d([label]);
        
        try {
          // 训练单个样本
          const result = await model.trainOnBatch(xs, ys);
          const loss = Array.isArray(result) ? result[0] : result;
          
          // 计算准确率（基于预测值和实际值的接近程度）
          const prediction = model.predict(xs);
          const accuracy = await tf.tidy(() => {
            // 计算预测值与真实值的欧氏距离
            const diff = prediction.sub(ys);
            const squaredDiff = diff.square();
            const meanSquaredError = squaredDiff.mean().dataSync()[0];
            // 将均方误差转换为准确率（误差越小，准确率越高）
            return Math.max(0, 1 - meanSquaredError);
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
          
          // 每处理完一个样本后暂停一下
          await new Promise(resolve => setTimeout(resolve, 200));
        } finally {
          // 清理内存
          ys.dispose();
        }
      }
      
      // 计算平均损失和准确率
      const avgLoss = totalLoss / batchCount;
      const avgAccuracy = totalAccuracy / batchCount;
      
      // 更新图表
      chart.data.labels.push(epoch + 1);
      chart.data.datasets[0].data.push(avgLoss);
      chart.data.datasets[1].data.push(avgAccuracy);
      chart.update();
      
      // 如果用户点击了停止按钮，停止训练
      if (!isTraining) break;
      
      // 每轮结束后暂停一下
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // 打印当前训练状态
      console.log(`轮次 ${epoch + 1}/${totalEpochs} 完成，平均损失: ${avgLoss.toFixed(4)}，平均准确率: ${(avgAccuracy * 100).toFixed(2)}%`);
    }

    exportModelBtn.disabled = false;
    alert('训练完成！');
  } catch (err) {
    console.error('训练过程中出错:', err);
    alert('训练过程中出错，请检查控制台获取详细信息');
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
  if (model) {
    await model.save('downloads://nfc-detector-model');
  }
});

// 重置训练状态
function resetTraining() {
  isTraining = false;
  model = null;
  trainingData = [];
  datasetCount.textContent = '0';
  currentEpoch.textContent = '0/0';
  trainLoss.textContent = '-';
  valAccuracy.textContent = '-';
  startTrainBtn.disabled = true;
  stopTrainBtn.disabled = true;
  exportModelBtn.disabled = true;
  
  chart.data.labels = [];
  chart.data.datasets[0].data = [];
  chart.data.datasets[1].data = [];
  chart.update();
} 