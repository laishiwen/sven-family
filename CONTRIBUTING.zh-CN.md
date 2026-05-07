# 参与贡献 Sven Family

[English](CONTRIBUTING.md) | [中文](CONTRIBUTING.zh-CN.md)

感谢你愿意为 Sven Family 做出贡献。

---

## 目录

- [贡献方式](#贡献方式)
- [开发环境搭建](#开发环境搭建)
- [开发流程](#开发流程)
- [分支命名](#分支命名)
- [提交规范](#提交规范)
- [代码风格](#代码风格)
- [测试](#测试)
- [Pull Request 检查清单](#pull-request-检查清单)
- [代码评审流程](#代码评审流程)
- [开发者原创声明](#开发者原创声明)
- [报告安全问题](#报告安全问题)

---

## 贡献方式

- 提交 Bug 与回归问题
- 提出改进建议与新功能需求
- 改进文档与示例
- 提交代码修复与增强

---

## 开发环境搭建

### 环境要求

- **Node.js** >= 20
- **pnpm** >= 11
- **Python** >= 3.11
- **uv**（Python 包管理器）
- **Docker & Docker Compose**（用于启动 PostgreSQL 和 Redis）

### 搭建步骤

1. Fork 并克隆仓库。

2. 安装依赖：

   ```bash
   pnpm install
   ```

3. 复制环境变量文件并编辑本地配置：

   ```bash
   cp backend/admin-backend/.env.example backend/admin-backend/.env
   cp backend/community-backend/.env.example backend/community-backend/.env
   cp backend/crawler/.env.example backend/crawler/.env
   cp backend/stats-service/.env.example backend/stats-service/.env
   ```

4. 启动基础设施服务：

   ```bash
   docker compose up -d postgres redis
   ```

5. 执行数据库迁移：

   ```bash
   cd backend/admin-backend && uv run alembic upgrade head
   ```

6. 启动开发环境：

   ```bash
   pnpm dev
   ```

---

## 开发流程

1. 选择或创建一个 Issue。
2. 从默认分支创建功能分支（参见[分支命名](#分支命名)）。
3. 按照[代码风格](#代码风格)和[提交规范](#提交规范)进行修改。
4. 为你的改动编写或更新测试（参见[测试](#测试)）。
5. 推送前运行 Lint 和类型检查：

   ```bash
   pnpm lint
   pnpm type-check
   ```

6. 推送分支并创建 Pull Request。
7. 根据评审反馈进行修改。

---

## 分支命名

使用以下前缀命名分支：

- `feat/` — 新功能
- `fix/` — 问题修复
- `docs/` — 文档更新
- `refactor/` — 重构（不改变外部行为）
- `test/` — 测试补充或更新
- `chore/` — 维护任务（依赖、CI、配置）

示例：`feat/add-export-csv`、`fix/login-redirect-loop`

---

## 提交规范

本项目遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范。每条提交信息应按照以下格式：

```
<类型>(<范围>): <简要描述>

<可选的详细说明>
```

类型：`feat`、`fix`、`docs`、`refactor`、`test`、`chore`、`perf`、`ci`

示例：

- `feat(admin): 添加用户列表 CSV 导出功能`
- `fix(community): 修复登录后重定向循环`
- `docs(readme): 补充数据库搭建说明`
- `refactor(data-collection): 提取 URL 标准化模块`

单个 PR 聚焦单一主题，避免混杂无关改动。

---

## 代码风格

### 前端（TypeScript / React）

- 仓库根目录已配置 ESLint 和 Prettier。
- 运行 `pnpm lint` 进行检查和自动修复。
- 组件结构与命名沿用项目现有模式。

### 后端（Python）

- 遵循 PEP 8 规范。
- 函数签名使用类型标注。
- 各服务沿用已有的 FastAPI 代码风格。

---

## 测试

### 前端

```bash
# 运行指定包的测试
pnpm --filter <包名> test

# 示例
pnpm --filter sven-community test
```

### 后端

```bash
# 运行指定后端服务的测试
cd backend/<服务名> && uv run pytest

# 示例
cd backend/admin-backend && uv run pytest
```

确保已有测试全部通过，并为你的改动补充相应的测试。

---

## Pull Request 检查清单

- [ ] 代码可正常构建（`pnpm build`）
- [ ] Lint 通过（`pnpm lint`）
- [ ] 类型检查通过（`pnpm type-check`）
- [ ] 测试通过（运行受影响包的测试）
- [ ] 行为变更已补充测试
- [ ] 行为变更已更新文档
- [ ] PR 描述清晰说明动机与影响
- [ ] 不包含无关文件改动
- [ ] 分支已与默认分支同步

---

## 代码评审流程

1. 提交 PR 后，维护者通常会在数个工作日内进行评审。
2. CI 检查必须全部通过后方可进入评审。
3. 评审者可能会提出修改建议，这是正常的协作过程。
4. 评审通过后，维护者将合并你的 PR。

---

## 开发者原创声明

向本项目提交贡献，即表示你声明：

1. 该贡献由你全部或部分创作，你有权在 MIT 协议下提交；或
2. 该贡献基于你合理判断属于合规开源协议的已有作品，你有权在此基础上提交修改后的作品；或
3. 该贡献由声明（1）或（2）的其他人员直接提供给你，你未对其进行修改。

本项目**不要求**签署 CLA（贡献者许可协议）。你保留贡献内容的版权，贡献内容沿用项目的 MIT 协议发布。

---

## 报告安全问题

**请勿在公开 Issue 中提交安全漏洞。**

安全漏洞的报告流程见 [SECURITY.md](SECURITY.md)。

---

## 行为准则

参与本项目即表示你同意遵守[行为准则](CODE_OF_CONDUCT.zh-CN.md)。
