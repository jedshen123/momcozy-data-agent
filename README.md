# Momcozy Data Agent

基于 PRD 搭建的数据分析平台，支持语义层建设、AI 对话分析、经验沉淀和优化建议。

## 技术栈

- **前端**: React + Vite + TypeScript + React Router
- **后端**: Node.js + Hono + TypeScript
- **LLM**: DeepSeek API（OpenAI 兼容接口）
- **数据存储**: YAML 文件（`data/semantic/`）

## 快速开始

### 1. 安装依赖

```bash
# 前端
cd frontend
npm install

# 后端
cd backend
npm install
```

### 2. 配置环境变量

在 `backend/` 目录创建 `.env` 文件：

```bash
DEEPSEEK_API_KEY=your_deepseek_api_key_here
PORT=3000
```

分析 Agent 在「开始分析」时会根据语义层（Metric/View/Cube）**编译并执行真实 SQL**。默认使用 `backend/data/warehouse/agent_dw.sqlite`（首次启动自动建表并写入演示数据）；可通过 `QUERY_SQLITE_PATH` 指定路径。

### 3. 启动开发服务器

```bash
# 终端 1 - 启动后端（端口 3000）
cd backend
npm run dev

# 终端 2 - 启动前端（端口 5173）
cd frontend
npm run dev
```

### 4. 访问应用

打开浏览器访问 http://localhost:5172

## 项目结构

```
momcozy-data-agent/
├── design/              # 设计文档和原型
│   ├── PRD.md          # 产品需求文档
│   ├── 00_ia_and_ux_system.md  # IA 和 UX 规范
│   └── ...
├── frontend/           # React 前端
│   ├── src/
│   │   ├── App.tsx    # 路由定义
│   │   ├── components/
│   │   │   └── Layout.tsx  # 顶栏导航
│   │   └── pages/     # 8 个模块页面
│   └── package.json
├── backend/            # Hono 后端
│   ├── src/
│   │   ├── index.ts   # 入口
│   │   ├── routes/    # API 路由
│   │   └── lib/
│   │       ├── llm.ts      # DeepSeek API 封装
│   │       └── storage.ts  # YAML 读写
│   └── package.json
└── data/
    └── semantic/       # 语义层数据（YAML）
        ├── cubes/
        ├── views/
        ├── metrics/
        ├── disambiguations/
        └── experiences/
```

## 功能模块

### 已实现（骨架）

1. **分析 Agent** (`/analysis`) - AI 流式对话，支持 DeepSeek API
2. **Cubes** (`/cubes`) - 物理语义层管理
3. **Views** (`/views`) - 逻辑查询层管理
4. **指标** (`/metrics`) - 业务指标定义
5. **澄清层** (`/disambiguations`) - 概念消歧
6. **经验层** (`/experiences`) - 分析路径沉淀
7. **优化师** (`/optimizer`) - 系统健康度报告
8. **Agent 配置** (`/agents`) - Agent 版本管理

### 待完善

- 各模块详细 UI（当前为占位页面）
- Cube/View/Metric 编辑器的完整交互
- 澄清层与分析的联动
- 经验层命中和复用逻辑
- 优化师报告生成

## API 端点

- `POST /api/analysis/event` - 分析 Agent 状态机事件（SSE，结构化 `session` / `token`）
- `GET /api/query/health` - 查询引擎状态（默认 Cube REST，可切 SQLite）
- `POST /api/query/preview` - 预览分析查询（Cube JSON 或 SQLite SQL）
- `POST /api/analysis/stream` - 分析自由对话（旧版兼容，SSE 流式）
- `GET /api/cubes` - 获取所有 Cubes
- `POST /api/cubes` - 创建 Cube
- `GET /api/views` - 获取所有 Views
- `GET /api/metrics` - 获取所有指标
- `GET /api/disambiguations` - 获取澄清列表
- `GET /api/experiences` - 获取经验列表
- `POST /api/optimizer/generate` - 生成优化报告（SSE 流式）
- `GET /api/agents` - 获取 Agent 配置

## 开发约定

- 顶栏顺序与文案**冻结**（见 PRD §3.1）
- AI 调用失败显示可重试错误
- 响应式：960px 以下垂直栈
- 所有路由已注册，页面为占位状态

## 下一步

1. 实现各模块的详细 UI（参考 `design/` 下的规格文档）
2. 完善 Cube/View/Metric 的向导式编辑器
3. 接入真实数仓元数据（MCP 或缓存文件）
4. 实现澄清层与分析的闭环
5. 添加经验层匹配和推荐逻辑
