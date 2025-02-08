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
    generateBtn: document.getElementById('generateDatasetBtn')
  },

  // 状态
  state: {
    images: [],
    currentIndex: -1,
    annotations: {},
    isDrawing: false,
    startX: 0,
    startY: 0,
    currentBox: null
  },

  // 初始化
  init() {
    this.ctx = this.elements.canvas.getContext('2d');
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

  // 加载图片
  async loadImage(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        this.elements.currentImage.src = e.target.result;
        this.elements.currentImage.onload = () => {
          // 调整画布大小以适应图片
          const containerWidth = this.elements.canvas.parentElement.clientWidth;
          const containerHeight = this.elements.canvas.parentElement.clientHeight;
          const scale = Math.min(
            containerWidth / this.elements.currentImage.naturalWidth,
            containerHeight / this.elements.currentImage.naturalHeight
          );
          
          const width = this.elements.currentImage.naturalWidth * scale;
          const height = this.elements.currentImage.naturalHeight * scale;
          
          // 设置画布尺寸
          this.elements.canvas.width = width;
          this.elements.canvas.height = height;
          
          // 清空画布
          this.ctx.clearRect(0, 0, width, height);
          
          // 绘制图片
          this.ctx.drawImage(this.elements.currentImage, 0, 0, width, height);
          
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
    
    // 清除之前的标注
    this.ctx.clearRect(0, 0, this.elements.canvas.width, this.elements.canvas.height);
    this.ctx.drawImage(this.elements.currentImage, 0, 0, this.elements.canvas.width, this.elements.canvas.height);
  },

  // 绘制过程
  drawing(e) {
    if (!this.state.isDrawing) return;
    
    const rect = this.elements.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // 清除之前的框
    this.ctx.clearRect(0, 0, this.elements.canvas.width, this.elements.canvas.height);
    this.ctx.drawImage(this.elements.currentImage, 0, 0, this.elements.canvas.width, this.elements.canvas.height);
    
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
  },

  // 完成绘制
  endDrawing() {
    this.state.isDrawing = false;
    if (this.state.currentBox && this.state.images[this.state.currentIndex]) {
      this.state.annotations[this.state.images[this.state.currentIndex].name] = this.state.currentBox;
    }
  },

  // 重置当前框
  resetBox() {
    if (this.state.images[this.state.currentIndex]) {
      delete this.state.annotations[this.state.images[this.state.currentIndex].name];
      this.ctx.clearRect(0, 0, this.elements.canvas.width, this.elements.canvas.height);
      this.ctx.drawImage(this.elements.currentImage, 0, 0, this.elements.canvas.width, this.elements.canvas.height);
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
  }
};

// 初始化标注工具
document.addEventListener('DOMContentLoaded', () => {
  AnnotationTool.init();
}); 