// tab 管理器
const TabManager = {
  // 初始化
  init() {
    this.tabButtons = document.querySelectorAll('.tab-button');
    this.tabContents = document.querySelectorAll('.tab-content');
    
    // 绑定点击事件
    this.tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const tabName = button.getAttribute('data-tab');
        this.switchTab(tabName);
        // 更新 URL
        this.updateURL(tabName);
      });
    });

    // 从 URL 读取 tab 参数
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');

    if (tabParam) {
      // 如果 URL 中有 tab 参数，切换到对应的 tab
      this.switchTab(tabParam);
    } else {
      // 否则默认选中第一个 tab
      const firstTab = this.tabButtons[0];
      const firstTabName = firstTab.getAttribute('data-tab');
      this.switchTab(firstTabName);
      this.updateURL(firstTabName);
    }

    // 监听浏览器前进后退
    window.addEventListener('popstate', (event) => {
      if (event.state && event.state.tab) {
        this.switchTab(event.state.tab, false);
      }
    });
  },

  // 切换 tab
  switchTab(tabName, pushState = true) {
    // 移除所有 active 类
    this.tabButtons.forEach(button => {
      button.classList.remove('active');
      if (button.getAttribute('data-tab') === tabName) {
        button.classList.add('active');
      }
    });

    this.tabContents.forEach(content => {
      content.classList.remove('active');
      if (content.id === tabName + 'Tab') {
        content.classList.add('active');
      }
    });

    // 更新 URL
    if (pushState) {
      this.updateURL(tabName);
    }
  },

  // 更新 URL
  updateURL(tabName) {
    const url = new URL(window.location);
    url.searchParams.set('tab', tabName);
    history.pushState({ tab: tabName }, '', url);
  }
};

// 当 DOM 加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  TabManager.init();
}); 