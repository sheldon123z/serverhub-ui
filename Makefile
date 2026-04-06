.PHONY: dev build test lint preview deploy-local clean

# 开发模式（Vite dev server，proxy → :9900）
dev:
	npm run dev

# 生产构建
build:
	npm ci && npm run build

# 测试
test:
	npx vitest run

# Lint
lint:
	npx eslint .

# 预览构建产物
preview:
	npm run preview

# 构建并部署到后端 static/ 目录
deploy-local:
	npm run build
	rm -rf ../server-hub/static && cp -r dist ../server-hub/static
	@echo "✓ 前端已部署到 ../server-hub/static/"

# 清理
clean:
	rm -rf dist node_modules .vite
