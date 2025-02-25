# NFC位置标记与检测系统

## 项目简介

本项目是一个基于Web技术的智能手机NFC位置标记与检测系统，提供完整的NFC位置标记、检测和验证解决方案。系统采用纯前端实现，支持传统图像处理和AI深度学习两种检测模式。

## 系统特点

- 🚀 纯前端实现，无需后端部署
- 🎯 支持手动标记与自动检测
- 🤖 集成AI深度学习模型
- 📊 完整的数据管理方案
- 🔄 标准化的处理流程
- 📱 支持多种设备型号

## 技术栈

- 核心框架：原生JavaScript
- UI框架：原生HTML/CSS
- 图像处理：Canvas API
- AI框架：TensorFlow.js
- 数据存储：LocalStorage/IndexedDB

## 快速开始

### 环境要求

- 现代浏览器（Chrome 80+/Firefox 75+/Safari 13+）
- Node.js 14.0+ (开发环境)
- NPM 6.0+ (开发环境)

### 安装步骤

1. 克隆项目
```bash
git clone https://github.com/your-username/nfc-location.git
cd nfc-location
```

2. 安装依赖
```bash
npm install
```

3. 启动开发服务器
```bash
npm run dev
```

4. 构建生产版本
```bash
npm run build
```

## 使用指南

### 手动标记模式

1. 打开系统，选择"手动标记"模块
2. 输入设备品牌和型号信息
3. 上传设备图片或使用预设模板
4. 在预览界面标记NFC位置
5. 导出标记数据（JSON格式）

### 自动检测模式

1. 选择检测模式（传统/AI）
2. 上传待检测图片或文件夹
3. 等待系统自动处理
4. 查看检测结果
5. 导出检测报告

### 数据标注工具

1. 进入标注工具界面
2. 导入待标注数据集
3. 按步骤完成标注
4. 导出标注结果
5. （可选）训练自定义模型

## 项目结构

```
nfc-location/
├── index.html          # 主页面
├── styles.css          # 全局样式
├── js/
│   ├── detect.js      # 检测核心逻辑
│   ├── mark.js        # 标记功能实现
│   ├── train.js       # 模型训练相关
│   ├── annotate.js    # 数据标注工具
│   └── utils/         # 工具函数
├── models/            # 预训练模型
├── assets/           # 静态资源
└── docs/            # 文档资源
```

## 数据格式规范

### 位置数据格式

```json
{
  "device": {
    "brand": "品牌名称",
    "model": "型号"
  },
  "nfcLocation": {
    "top": 0.3245,    // 相对位置（0-1）
    "left": 0.1523,
    "width": 0.2156,
    "height": 0.1254
  }
}
```

### 检测结果格式

```json
{
  "status": "success",
  "confidence": 0.95,
  "location": {
    "top": 0.3245,
    "left": 0.1523,
    "width": 0.2156,
    "height": 0.1254
  },
  "metadata": {
    "processTime": "123ms",
    "mode": "ai"
  }
}
```

## 开发指南

### 代码规范

- 使用 ESLint 进行代码检查
- 遵循 Airbnb JavaScript 风格指南
- 使用 JSDoc 注释规范

### 提交规范

- feat: 新功能
- fix: 修复问题
- docs: 文档变更
- style: 代码格式
- refactor: 代码重构
- test: 测试相关
- chore: 其他修改

## 常见问题

1. Q: 系统支持哪些图片格式？
   A: 支持 PNG、JPG、JPEG 格式，建议使用白色背景的图片

2. Q: 如何提高检测准确率？
   A: 确保图片清晰度，使用标准光照条件，避免复杂背景

3. Q: 是否支持批量处理？
   A: 支持，但建议单次不超过100张图片

## 贡献指南

1. Fork 本仓库
2. 创建特性分支
3. 提交更改
4. 发起 Pull Request

## 开源协议

MIT License

## 联系方式

- 项目负责人：[姓名]
- 邮箱：[邮箱地址]
- 问题反馈：[Issues页面] 