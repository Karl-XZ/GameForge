# Gemini GameForge (Vercel)

一个基于 Gemini 3 API 的生成式游戏工坊，能够生成 **文字冒险/TRPG** 和 **横版动作** 游戏原型，支持 **独立游戏页面** 和 **离线 zip 导出**。

## Inspiration

生成式 AI 正在重塑创意编程领域，但大多数工具停留在"文本生成"层面。我们希望构建一个端到端的游戏生成系统——从创意构思到可运行的游戏，每一步都可编辑、可重试。通过 Gemini 3 的强大能力，让非开发者也能快速将想法转化为可玩的网页游戏。

## Gemini 3 Integration

### 核心特性

本项目深度集成 Gemini 3 API，充分利用其多模态与结构化输出能力：

1. **结构化生成**：使用 `responseJsonSchema` 配合 Zod 验证，确保输出严格符合游戏数据格式。包含自动重试机制：当 Schema 验证失败时，将错误信息反馈给模型进行修复，最多重试 3 次。

2. **多模态图像生成**：通过 `gemini-2.5-flash-image` 生成游戏资产（场景 CG、角色精灵、道具等），支持文本到图像和图像到图像两种模式。

3. **流式响应**：在 `generate-stream` API 中使用 Server-Sent Events (SSE)，实时推送生成进度，提供流畅的用户体验。

4. **智能游戏代码生成**：将资产 JSON 和游戏规则要求传递给 Gemini，生成完整的 HTML5 游戏代码（文字冒险使用原生 JS，横版动作使用 Phaser 引擎）。

### 中心能力

Gemini 3 的 **结构化输出** 是本项目的核心能力。它确保游戏逻辑、场景数据、资产清单等都能以可靠的 JSON 格式返回，这是实现可编辑、可重试生成流程的基础。相比传统提示工程，结构化输出大幅降低了后处理复杂度，提升了生成质量的一致性。

### 自检与重试机制

- **Schema 验证循环**：每次结构化生成后，使用 Zod 进行验证；失败时构造修复 Prompt，保留有效字段，仅修正错误部分。
- **图像生成重试**：单个图像生成失败时可独立重试，无需重新生成整个场景。
- **超时与降级**：Vercel 函数最大时长设置为 60 秒，超时任务支持断点续传。

## What it does

### 主要功能

- **文字冒险/TRPG 生成**：先生成整体剧情大纲（可编辑）→ 确认后生成各场景 JSON（文本、选项、CG 提示等）→ 逐场景生成图像 → 组装成完整游戏。
- **横版动作游戏生成**：先输出完整资产清单 JSON → 批量生成所有图像资产（需抠图的使用纯绿背景）→ 本地算法抠图 → 将资产和需求交给 AI 生成可玩游戏 → 打包输出。
- **离线可玩**：导出 zip 包，解压后双击 `index.html` 即可在本地运行。
- **独立游戏页面**：生成完成后通过 `/game/[id]` 独立页面游玩，主页仅展示生成、预览和下载入口。
- **双模式交互**：分步编辑/重试 + 一键全流程生成。

### 交互模式

- **分步模式**：每一步都可以编辑并重新提交，支持单步回滚和重试。
- **一键模式**：自动串联 1-5 步，默认"自动确认上一阶段"，但允许中途暂停返回任意步骤编辑。

## How we built it

### 技术栈

- **前端**：Next.js 14 (App Router) + React 18 + TypeScript + Tailwind CSS
- **国际化**：next-intl（支持中英文）
- **AI 集成**：@google/genai SDK + Zod 验证
- **图像处理**：Sharp（绿幕抠图）
- **游戏引擎**：Phaser 3（横版动作游戏）
- **打包**：JSZip（离线包生成）

### 项目结构

```
src/
├── app/
│   ├── [locale]/          # 国际化路由
│   │   ├── page.tsx       # 主页（生成界面）
│   │   └── game/[id]/     # 独立游戏页面
│   └── api/
│       ├── generate/      # 非流式生成 API
│       └── generate-stream/ # 流式生成 API（推荐）
├── lib/
│   ├── gemini.ts          # Gemini API 封装
│   ├── zod-schemas.ts     # 数据结构定义
│   └── game-export/       # 游戏打包逻辑
└── types/                 # TypeScript 类型定义
```

### 生成流水线

#### 文字冒险/TRPG

1. **剧情大纲**：AI 输出世界观、关键角色、主要冲突、结局方向
2. **用户编辑/确认**：在 UI 中修改剧情大纲并确认
3. **场景 JSON**：生成每个场景的结构化内容（sceneId、text、choices、cgPrompt 等）
4. **逐场景生成图像**：根据 cgPrompt 生成图像
5. **组装导出**：打包 JSON + 图像为离线可运行的 index.html

#### 横版动作游戏

1. **需求思考 + 资产清单**：AI 输出完整资产 prompt JSON（主角、敌人、道具、特效、UI、背景等）
2. **资产生成**：批量生成所有资产图像
3. **抠图处理**：本地算法绿幕抠图 → 透明 PNG
4. **游戏生成**：将资产和关卡/机制要求交给 AI 生成完整 HTML5 游戏
5. **组装导出**：打包为离线可运行的 zip

## Challenges we ran into

1. **结构化输出的一致性**：Gemini 偶尔会返回格式错误的 JSON，即使使用 JSON mode。解决方案：实现 3 次重试机制，每次失败时构造修复 Prompt 保留有效字段。

2. **图像抠图质量**：绿幕抠图算法对复杂背景边缘处理不够理想。解决方案：在 Prompt 中要求纯绿色背景，并优化颜色阈值参数。

3. **离线运行限制**：`file://` 协议无法使用 `fetch` 读取本地文件。解决方案：将游戏数据内联到 index.html 的 `<script>` 标签中，避免网络请求。

4. **Vercel 函数超时**：长流程生成易超时。解决方案：使用流式 API 提供进度反馈，实现断点续传支持。

## Accomplishments that we're proud of

- ✅ 实现了完整的端到端游戏生成流水线，从创意到可玩游戏
- ✅ 构建了可靠的编辑和重试机制，用户体验流畅
- ✅ 成功生成可离线运行的游戏包，零依赖外部 CDN
- ✅ 深度集成 Gemini 3 的结构化输出，大幅提升生成质量
- ✅ 支持中英文双语界面，国际化体验完善

## What we learned

1. **结构化输出的重要性**：通过 Schema 驱动的生成，比纯 Prompt 工程更可靠、可维护。
2. **渐进式生成策略**：先大纲后细节的设计让用户有更多控制权，也减少了单次生成的复杂度。
3. **离线优先设计**：考虑 `file://` 协议的限制，提前规避常见坑点。
4. **容错机制的必要性**：在 AI 生成中，重试和修复机制是保证稳定性的关键。

## What's next for GameForge

- [ ] 添加更多游戏类型（解谜、养成、卡牌等）
- [ ] 支持用户自定义风格（像素风、写实风、日漫风等）
- [ ] 实现云端存储和游戏分享功能
- [ ] 优化图像生成质量和抠图效果
- [ ] 添加音效和背景音乐生成

## Getting Started

### 环境要求

- Node.js 18+
- npm 或 pnpm

### 安装

```bash
# 克隆仓库
git clone https://github.com/yourusername/gemini-gameforge-vercel.git
cd gemini-gameforge-vercel

# 安装依赖
npm install
```

### 配置环境变量

创建 `.env.local` 文件：

```env
GEMINI_API_KEY=your_gemini_api_key
GEMINI_TEXT_MODEL=gemini-3-flash-preview
GEMINI_IMAGE_MODEL=gemini-2.5-flash-image
```

获取 Gemini API Key：[Google AI Studio](https://aistudio.google.com/app/apikey)

### 本地开发

```bash
npm run dev
```

打开浏览器访问：`http://localhost:3000`

### 构建部署

```bash
# 构建生产版本
npm run build

# 启动生产服务器
npm start
```

#### Vercel 部署

1. 将项目推送到 GitHub
2. 在 Vercel 中导入项目
3. 配置环境变量（`GEMINI_API_KEY` 等）
4. 部署完成

## 使用指南

### 生成文字冒险游戏

1. 选择 "Text Adventure" 标签
2. 输入游戏创意（例如："一个关于时间旅行的侦探故事"）
3. 点击 "Generate Outline" 生成剧情大纲
4. 编辑大纲后点击 "Confirm" 确认
5. 生成场景 JSON 和图像
6. 生成完成后点击 "Play" 游玩或 "Download ZIP" 下载

### 生成横版动作游戏

1. 选择 "Side-Scroller" 标签
2. 输入游戏创意（例如："一个赛博朋克风格的跑酷游戏"）
3. 点击 "Generate Assets" 生成资产清单
4. 编辑资产后点击 "Generate Images" 生成所有图像
5. 系统自动抠图后生成游戏代码
6. 生成完成后点击 "Play" 游玩或 "Download ZIP" 下载

### 一键生成

点击 "One-Click Generate" 按钮，系统将自动执行完整流程。生成过程中可随时暂停编辑任意步骤。

## 导出包结构

```
GAME_ID.zip
├─ index.html       # 主游戏文件（内联游戏数据）
├─ assets/
│  ├─ cover.png     # 封面图
│  ├─ scene-001.png # 场景图
│  ├─ player.png    # 主角精灵
│  └─ ...           # 其他资产
└─ game.json        # 调试用（可选）
```

> **注意**：`index.html` 不依赖外部 CDN，所有资源使用相对路径，确保 `file://` 协议可直接打开运行。

## License

MIT

## Acknowledgments

- Google Gemini 3 API
- Next.js 团队
- Phaser 游戏引擎
