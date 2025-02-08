// 标注工具命名空间
const AnnotationTool = {
  // DOM 元素
  elements: {
    input: document.getElementById('annotationInput'),
    imageCount: document.getElementById('imageCount'),
    currentImage: document.getElementById('currentImage'),
    canvas: document.getElementById('annotationCanvas'),
    prevBtn: document.getElementById('prevImageBtn'),
    nextBtn: document.getElementById('nextImageBtn'),
    progress: document.getElementById('imageProgress'),
    resetBtn: document.getElementById('resetBoxBtn'),
    generateBtn: document.getElementById('generateDatasetBtn'),
    jsonDisplay: document.getElementById('annotationJson')
  },

  // 状态
  state: {
    images: [],
    currentIndex: -1,
    annotations: {},
    isDrawing: false,
    startX: 0,
    startY: 0,
    currentBox: null,
    currentBounds: null,  // 添加当前图片的边界信息
    currentImageInfo: null  // 添加当前图片信息
  },

  // 初始化
  init() {
    this.ctx = this.elements.canvas.getContext('2d');
    
    // 创建JSON显示区域
    const jsonDisplay = document.createElement('div');
    jsonDisplay.className = 'json-display';
    jsonDisplay.innerHTML = `
      <h3>标注信息</h3>
      <pre id="annotationJson">暂无标注</pre>
    `;
    
    // 将JSON显示区域插入到图片容器旁边
    const imageContainer = document.querySelector('.image-container');
    const workspaceWrapper = document.createElement('div');
    workspaceWrapper.className = 'workspace-wrapper';
    
    // 重新组织DOM结构
    imageContainer.parentNode.insertBefore(workspaceWrapper, imageContainer);
    workspaceWrapper.appendChild(imageContainer);
    workspaceWrapper.appendChild(jsonDisplay);
    
    // 更新elements中的jsonDisplay引用
    this.elements.jsonDisplay = document.getElementById('annotationJson');
    
    this.bindEvents();
  },

  // 绑定事件
  bindEvents() {
    this.elements.input.addEventListener('change', this.handleFileSelect.bind(this));
    this.elements.prevBtn.addEventListener('click', this.showPreviousImage.bind(this));
    this.elements.nextBtn.addEventListener('click', this.showNextImage.bind(this));
    this.elements.resetBtn.addEventListener('click', this.resetBox.bind(this));
    this.elements.generateBtn.addEventListener('click', this.generateDataset.bind(this));
    this.elements.canvas.addEventListener('mousedown', this.startDrawing.bind(this));
    this.elements.canvas.addEventListener('mousemove', this.drawing.bind(this));
    this.elements.canvas.addEventListener('mouseup', this.endDrawing.bind(this));
  },

  // 处理文件选择
  async handleFileSelect(e) {
    const files = Array.from(e.target.files).filter(file => 
      file.type.startsWith('image/')
    );

    if (files.length === 0) {
      alert('未找到图片文件');
      return;
    }

    this.state.images = files;
    this.elements.imageCount.textContent = files.length;
    this.elements.progress.textContent = '0/' + files.length;
    
    // 启用按钮
    this.elements.resetBtn.disabled = false;
    this.elements.generateBtn.disabled = false;
    
    // 显示第一张图片
    this.state.currentIndex = -1;
    this.showNextImage();
  },

  // 显示下一张图片
  async showNextImage() {
    if (this.state.currentIndex < this.state.images.length - 1) {
      this.state.currentIndex++;
      await this.loadImage(this.state.images[this.state.currentIndex]);
      this.updateNavigationButtons();
    }
  },

  // 显示上一张图片
  async showPreviousImage() {
    if (this.state.currentIndex > 0) {
      this.state.currentIndex--;
      await this.loadImage(this.state.images[this.state.currentIndex]);
      this.updateNavigationButtons();
    }
  },

  // 预处理图片以检测实际设备边界
  async preprocessImage(img) {
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = img.naturalWidth;
    tempCanvas.height = img.naturalHeight;
    
    // 绘制原始图片到临时画布
    tempCtx.drawImage(img, 0, 0);
    const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    const data = imageData.data;
    
    let minX = tempCanvas.width;
    let minY = tempCanvas.height;
    let maxX = 0;
    let maxY = 0;

    // 统计每行和每列的非透明且非白色像素
    const rowCounts = new Array(tempCanvas.height).fill(0);
    const colCounts = new Array(tempCanvas.width).fill(0);

    // 扫描所有像素
    for (let y = 0; y < tempCanvas.height; y++) {
      for (let x = 0; x < tempCanvas.width; x++) {
        const index = (y * tempCanvas.width + x) * 4;
        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];
        const a = data[index + 3];

        // 检查是否是有效的设备像素
        const isTransparent = a < 10;
        const isWhite = r > 240 && g > 240 && b > 240;
        const isDevicePixel = !isTransparent && !isWhite;

        if (isDevicePixel) {
          rowCounts[y]++;
          colCounts[x]++;
        }
      }
    }

    // 设定阈值
    const minRowPixels = Math.floor(tempCanvas.width * 0.01);
    const minColPixels = Math.floor(tempCanvas.height * 0.01);

    // 查找有效边界
    for (let y = 0; y < tempCanvas.height; y++) {
      if (rowCounts[y] > minRowPixels) {
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }

    for (let x = 0; x < tempCanvas.width; x++) {
      if (colCounts[x] > minColPixels) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  },

  // 加载图片
  async loadImage(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        this.elements.currentImage.src = e.target.result;
        this.elements.currentImage.onload = async () => {
          // 预处理图片以获取实际设备边界
          const bounds = await this.preprocessImage(this.elements.currentImage);
          this.state.currentBounds = bounds;  // 保存当前边界信息
          
          // 调整画布大小以适应图片的实际边界
          const containerWidth = this.elements.canvas.parentElement.clientWidth;
          const containerHeight = this.elements.canvas.parentElement.clientHeight;
          
          // 使用实际设备边界计算缩放比例
          const scale = Math.min(
            containerWidth / bounds.width,
            containerHeight / bounds.height
          );
          
          const width = bounds.width * scale;
          const height = bounds.height * scale;
          
          // 设置画布尺寸
          this.elements.canvas.width = width;
          this.elements.canvas.height = height;
          
          // 清空画布
          this.ctx.clearRect(0, 0, width, height);
          
          // 绘制裁剪后的图片
          this.ctx.drawImage(
            this.elements.currentImage,
            bounds.x, bounds.y, bounds.width, bounds.height,  // 源图像的裁剪区域
            0, 0, width, height  // 目标画布的绘制区域
          );
          
          // 如果有已保存的标注，绘制它
          if (this.state.annotations[file.name]) {
            this.drawSavedBox(this.state.annotations[file.name]);
          }
          
          // 更新进度显示
          this.elements.progress.textContent = `${this.state.currentIndex + 1}/${this.state.images.length}`;
          
          resolve();
        };
      };
      reader.readAsDataURL(file);
    });
  },

  // 更新导航按钮状态
  updateNavigationButtons() {
    this.elements.prevBtn.disabled = this.state.currentIndex <= 0;
    this.elements.nextBtn.disabled = this.state.currentIndex >= this.state.images.length - 1;
  },

  // 绘制已保存的标注框
  drawSavedBox(box) {
    this.ctx.strokeStyle = '#00ff00';
    this.ctx.lineWidth = 2;
    const width = box.width * this.elements.canvas.width;
    const height = box.height * this.elements.canvas.height;
    const x = box.x * this.elements.canvas.width;
    const y = box.y * this.elements.canvas.height;
    this.ctx.strokeRect(x, y, width, height);
  },

  // 开始绘制
  startDrawing(e) {
    const rect = this.elements.canvas.getBoundingClientRect();
    this.state.startX = e.clientX - rect.left;
    this.state.startY = e.clientY - rect.top;
    this.state.isDrawing = true;
    
    // 清除之前的标注并重绘图片
    this.ctx.clearRect(0, 0, this.elements.canvas.width, this.elements.canvas.height);
    this.ctx.drawImage(
      this.elements.currentImage,
      this.state.currentBounds.x, this.state.currentBounds.y, 
      this.state.currentBounds.width, this.state.currentBounds.height,
      0, 0, this.elements.canvas.width, this.elements.canvas.height
    );
  },

  // 绘制过程
  drawing(e) {
    if (!this.state.isDrawing) return;
    
    const rect = this.elements.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // 清除之前的框并重绘图片
    this.ctx.clearRect(0, 0, this.elements.canvas.width, this.elements.canvas.height);
    this.ctx.drawImage(
      this.elements.currentImage,
      this.state.currentBounds.x, this.state.currentBounds.y, 
      this.state.currentBounds.width, this.state.currentBounds.height,
      0, 0, this.elements.canvas.width, this.elements.canvas.height
    );
    
    // 绘制新框
    this.ctx.strokeStyle = '#00ff00';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(this.state.startX, this.state.startY, x - this.state.startX, y - this.state.startY);
    
    // 保存当前框
    this.state.currentBox = {
      x: Math.min(this.state.startX, x) / this.elements.canvas.width,
      y: Math.min(this.state.startY, y) / this.elements.canvas.height,
      width: Math.abs(x - this.state.startX) / this.elements.canvas.width,
      height: Math.abs(y - this.state.startY) / this.elements.canvas.height
    };

    // 实时更新JSON显示
    this.updateJsonDisplay();
  },

  // 完成绘制
  endDrawing() {
    this.state.isDrawing = false;
    if (this.state.currentBox && this.state.images[this.state.currentIndex]) {
      this.state.annotations[this.state.images[this.state.currentIndex].name] = this.state.currentBox;
      // 更新JSON显示
      this.updateJsonDisplay();
    }
  },

  // 重置当前框
  resetBox() {
    if (this.state.images[this.state.currentIndex]) {
      delete this.state.annotations[this.state.images[this.state.currentIndex].name];
      this.state.currentBox = null;
      this.ctx.clearRect(0, 0, this.elements.canvas.width, this.elements.canvas.height);
      this.ctx.drawImage(
        this.elements.currentImage,
        this.state.currentBounds.x, this.state.currentBounds.y, 
        this.state.currentBounds.width, this.state.currentBounds.height,
        0, 0, this.elements.canvas.width, this.elements.canvas.height
      );
      // 更新JSON显示
      this.updateJsonDisplay();
    }
  },

  // 生成数据集
  async generateDataset() {
    // 创建一个新的 JSZip 实例
    const zip = new JSZip();
    
    // 创建 images 文件夹
    const imagesFolder = zip.folder("images");
    
    // 准备标注数据
    const dataset = {
      images: Object.entries(this.state.annotations).map(([filename, box]) => ({
        file_name: filename,
        annotations: box
      }))
    };

    // 添加 annotations.json 文件
    zip.file("annotations.json", JSON.stringify(dataset, null, 2));

    // 添加图片文件到 images 文件夹
    const promises = this.state.images.map(async (file) => {
      const arrayBuffer = await file.arrayBuffer();
      imagesFolder.file(file.name, arrayBuffer);
    });

    // 等待所有图片添加完成
    await Promise.all(promises);

    // 生成 zip 文件
    const content = await zip.generateAsync({type: "blob"});
    
    // 下载 zip 文件
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'training_dataset.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  // 更新JSON显示
  updateJsonDisplay() {
    // 确保jsonDisplay元素存在
    if (!this.elements.jsonDisplay) {
      console.warn('JSON显示元素未初始化');
      return;
    }

    if (!this.state.currentBox || !this.state.images[this.state.currentIndex]) {
      this.elements.jsonDisplay.textContent = '暂无标注';
      return;
    }

    const currentImage = this.state.images[this.state.currentIndex];
    const fileName = currentImage.name;
    
    // 构建JSON对象，只包含文件名和标注信息
    const jsonData = {
      file_name: fileName,
      annotations: {
        x: Math.round(this.state.currentBox.x * 1000) / 1000,
        y: Math.round(this.state.currentBox.y * 1000) / 1000,
        width: Math.round(this.state.currentBox.width * 1000) / 1000,
        height: Math.round(this.state.currentBox.height * 1000) / 1000
      }
    };

    // 格式化并显示JSON
    this.elements.jsonDisplay.textContent = JSON.stringify(jsonData, null, 2);
  }
};

// 初始化标注工具
document.addEventListener('DOMContentLoaded', () => {
  AnnotationTool.init();
}); 