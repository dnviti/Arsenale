# Makefile to replicate .vscode/launch.json and tasks.json configurations

.PHONY: help install generate-db server-dev server-debug client-dev migrate-dev prisma-studio full-stack

help:
	@echo "Available targets (mapped from .vscode/launch.json):"
	@echo "  make server-dev    - Server: Dev (with watch, generates DB first)"
	@echo "  make server-debug  - Server: Debug (no watch)"
	@echo "  make client-dev    - Client: Dev"
	@echo "  make migrate-dev   - Prisma: Migrate Dev"
	@echo "  make prisma-studio - Prisma: Studio"
	@echo "  make full-stack    - Full Stack: Server + Client (installs and runs both)"
	@echo "  make install       - Task: node:install (npm install)"
	@echo "  make generate-db   - Task: db:generate (npm run db:generate)"

# Tasks
install:
	npm install

generate-db:
	npm run db:generate

# Launch Configurations
server-dev: generate-db
	cd server && npx tsx watch src/index.ts

server-debug:
	cd server && npx tsx src/index.ts

client-dev:
	cd client && npx vite

migrate-dev:
	cd server && npx prisma migrate dev

prisma-studio:
	cd server && npx prisma studio

# Compound Configuration
full-stack: install
	npx concurrently -n server,client -c blue,green "$(MAKE) server-dev" "$(MAKE) client-dev"
