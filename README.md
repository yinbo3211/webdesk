# WebDesk · 网页版功能桌面

一个运行在浏览器里的「个人功能启动器」：把常用网页工具像手机 / 平板桌面上的应用图标一样收纳、摆放和打开。**电脑端是 iPad 平板范式，手机端是 iOS 主屏范式**，同一份数据、两套熟悉的心智模型。

- 零依赖、零构建即可运行：直接双击 `index.html`，或把整个目录丢到任意静态托管。
- 苹果风格设计系统：squircle 图标、毛玻璃 Dock、语义色、弹簧动效、亮 / 暗双主题。
- **全局国际化**：7 种语言即时切换、零硬编码、含 RTL 阿拉伯语，界面 / 日期 / 数字 / 复数 / 无障碍标签 / 导出文件名全部联动。
- 数据只存在浏览器 `localStorage`，不上传任何内容；支持 JSON 导入导出备份。

> 本仓库是依据 [《网页版功能桌面 WebDesk 产品需求文档 V2.0 修正版》](docs/PRD.md) 实现的前端原型，覆盖 P0 全部 14 项与部分 P1 能力。

---

## 快速开始

```bash
# 方式一：直接打开
open index.html                 # macOS
xdg-open index.html             # Linux

# 方式二：本地静态服务（推荐，避免个别浏览器对 file:// 的限制）
python3 -m http.server 8080
# 浏览器访问 http://localhost:8080
```

单文件版 `dist/index.html` 已内联全部 CSS / 语言包 / 脚本，可单独分发、离线使用、或直接作为页面发布。

---

## 目录结构

```
webdesk/
├── index.html                     # 页面骨架（可见文案全部走 data-i18n，零硬编码）
├── assets/
│   ├── css/style.css              # Apple 风格设计系统（语义色 / 字阶 / 材质 / 动效 / RTL）
│   └── js/
│       ├── locales.generated.js   # 由构建脚本生成，勿手改
│       ├── i18n.js                # 国际化运行时（切换 / 复数 / Intl 格式化 / 跨标签同步）
│       └── app.js                 # 应用逻辑（桌面 / Dock / 拖拽 / 设置 / 引导 / 搜索…）
├── locales/                       # 权威语言包（每语言一个 JSON，7 份，键 100% 对齐）
│   ├── zh-Hans.json  en-US.json  zh-Hant.json
│   ├── ja-JP.json    ko-KR.json  es-ES.json  ar-SA.json
├── tools/
│   ├── build-i18n.js              # i18n 构建门禁：键完整性 / 覆盖率 / 硬编码扫描
│   └── build-single.js            # 打包成单文件 dist/index.html
├── docs/PRD.md                    # 产品需求文档 V2.0
├── dist/index.html                # 自包含单文件产物
└── README.md
```

---

## 功能对照（PRD）

| PRD 编号 | 能力 | 状态 |
| --- | --- | --- |
| FR-01/02 | 添加应用、URL 校验、favicon 自动抓取（多源回退）、emoji / 上传 / 字母兜底图标 | ✅ |
| FR-03 | 单击即开（新标签，`noopener noreferrer`）、白名单同域应用全屏层 | ✅ |
| FR-04 | Pointer Events 拖拽排序、FLIP 让位、撤销排列 | ✅ |
| FR-05 | 手机 4×6（短屏 4×5）多屏翻页、页码指示器 | ✅ |
| FR-06 | 长按 500ms 编辑态、抖动、删除角标、二次确认、完成退出 | ✅ |
| FR-07 | localStorage 实时持久化、写入失败横幅 | ✅ |
| FR-08 | JSON 导入导出、格式校验、版本检查、合并 / 覆盖 | ✅ |
| FR-09 | 双因子形态判定（输入方式 + 宽度），375/820/1440 自适应 | ✅ |
| FR-10 | 亮 / 暗 / 跟随系统三态主题 | ✅ |
| FR-11 | 三步首启引导，可跳过、可重看 | ✅ |
| FR-12 | 语言切换器（顶部地球 / 设置 / 长按标题 / URL / 跟随系统） | ✅ |
| FR-13 | 空状态、删除后 5s 撤销 | ✅ |
| FR-14 | 设置面板：主题 / 壁纸 / 动效 / 语言 / 数据管理 / 帮助 | ✅ |
| FR-16/19/20 | 右键菜单、应用搜索（含拼音首字母）、8 张内置壁纸 | ✅ |
| FR-17 | Dock 成员增删与排序（设置内「整理程序坞」，最多 6 个） | ✅ |
| FR-21 | 按使用频率排列（本地统计打开次数，需用户确认后执行，可撤销） | ✅ |
| 12.2/12.3 | 数据模型含 version / locale / folders / meta.deviceId，导入旧版本自动幂等迁移 | ✅ |
| — | 键盘全路径、ARIA 标签、焦点环、减弱动效、200% 缩放 | ✅ |
| FR-15/18/22 | 多窗口舞台、文件夹、云同步 | 规划中（P1） |

### 交互速查

| 操作 | 手机 | 电脑 / 平板 |
| --- | --- | --- |
| 打开应用 | 点按 | 单击 |
| 进入整理 | 长按 500ms | 长按 500ms / 按住拖动 8px |
| 排序 | 编辑态拖动 | 编辑态拖动 |
| 删除 | 角标 × → 确认 | 角标 × 或右键 → 确认 |
| 换语言 | 设置 / 长按标题 | 顶部地球 / `Ctrl+,` |
| 搜索 | `Ctrl/⌘+K` | `Ctrl/⌘+K` |
| 返回桌面 / 关闭 | `Esc` | `Esc` |

---

## 安全与隐私

- URL 仅接受 `http/https`，拦截 `javascript:` 等协议注入；外链统一 `rel="noopener noreferrer"`。
- 应用名称与网址一律通过 `textContent` / `setAttribute` 输出，不拼接 HTML，防 XSS。
- 导入文件：结构校验 + 字段白名单 + 2MB 上限。
- iframe 全屏层仅对同源应用开放，带最小权限 `sandbox`。
- 未登录时数据只存本地，不采集网址内容、不上报打开次数。

---

## 重新打包

```bash
node tools/build-i18n.js      # 生成 locales/*.json 与 locales.generated.js
node tools/build-single.js    # 生成 dist/index.html
```

## 许可

原型代码，供产品评审与二次开发使用。
