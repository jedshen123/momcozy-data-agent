# Momcozy Data Agent 后端

## 环境变量

创建 `.env` 文件：

```bash
DEEPSEEK_API_KEY=your_deepseek_api_key_here
PORT=3000
```

## 安装依赖

```bash
npm install
```

## 启动开发服务器

```bash
npm run dev
```

## API 端点

- `POST /api/analysis/stream` - 分析 Agent 流式对话
- `GET /api/cubes` - 获取所有 Cubes
- `GET /api/cubes/:id` - 获取单个 Cube
- `POST /api/cubes` - 创建 Cube
- `PUT /api/cubes/:id` - 更新 Cube
- `DELETE /api/cubes/:id` - 删除 Cube
- 其他模块（views / metrics / disambiguations / experiences）同理
- `POST /api/optimizer/generate` - 生成优化报告
- `GET /api/agents` - 获取 Agent 配置
