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

    // 过滤出图片文件
    const imageFiles = files.filter(file => 
      file.type.startsWith('image/')
    );

    if (imageFiles.length === 0) {
      alert('未找到有效的图片文件');
      return;
    }

    console.log(`找到 ${imageFiles.length} 个图片文件`);
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
          trainingData.images.push(tensor);
          // 使用标注数据中的坐标
          trainingData.labels.push([
            annotation.annotations.x,
            annotation.annotations.y,
            annotation.annotations.width,
            annotation.annotations.height
          ]);
          
          // 更新进度
          datasetCount.textContent = `已加载 ${trainingData.images.length} 个样本，共 ${imageFiles.length} 个`;
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
      alert('没有成功加载任何训练数据，请确保图片文件名与标注数据匹配');
    }

  } catch (err) {
    console.error('加载数据集时出错:', err);
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
        
        // 绘制调整后的图片
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        
        // 创建填充后的张量
        const tensor = tf.tidy(() => {
          // 首先将图像转换为张量
          const imageTensor = tf.browser.fromPixels(canvas)
            .toFloat()
            .div(255.0);
          
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
        
        resolve(tensor);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

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
  
  const optimizer = tf.train.adam(0.001);
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
    const totalEpochs = 10; // 限制最大训练轮数
    
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
          
          // 计算准确率
          const prediction = model.predict(xs);
          const predictedBox = prediction.dataSync();
          
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
    console.error('导出模型失败:', error);
    alert('导出模型失败，请查看控制台了解详情');
  }
}); 