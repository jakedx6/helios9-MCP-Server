# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Build and Development
- **Build**: `npm run build` - Compiles TypeScript to JavaScript in dist/
- **Development**: `npm run dev` - Runs TypeScript compiler in watch mode
- **Start**: `npm start` - Runs the compiled server from dist/index.js
- **Clean**: `npm run clean` - Removes dist/ directory

### TypeScript Configuration
- **Full build**: `tsc` - Uses tsconfig.json (includes all tools)
- **Core build**: `tsc -p tsconfig.core.json` - Minimal build with only essential tools

## Architecture Overview

This is a Model Context Protocol (MCP) server that provides AI agents with structured access to project management functionality. The architecture follows these key principles:

### MCP Protocol Implementation
The server implements MCP v2024-11-05 specification with three main capabilities:
1. **Tools**: Functions that AI agents can invoke (create_project, update_task, etc.)
2. **Resources**: Dynamic data endpoints that provide real-time information
3. **Prompts**: Pre-defined templates for common AI workflows

### Core Components

**Entry Points** (src/):
- `index.ts`: Full server with all 15+ tools
- `index-minimal.ts`: Minimal server with core tools only

**Authentication Flow** (src/lib/auth.ts):
- API Key authentication for service accounts (uses DEFAULT_USER_ID)
- Supabase Access Token for user sessions
- All database operations respect Row Level Security (RLS)

**Tool Organization** (src/tools/):
Each tool category handles specific domain logic:
- `projects.ts`: Project CRUD and context aggregation
- `tasks.ts`: Task management with Kanban board support
- `documents.ts`: Markdown documents with frontmatter and link analysis
- Advanced tools for AI conversations, analytics, search, and workflows

**Database Integration**:
- Direct Supabase client connections (planning migration to SaaS API pattern)
- Strong typing with Zod schemas matching database types
- All operations filtered by authenticated user_id

### MCP Server Lifecycle

1. **Initialization**: Server reads environment config, validates auth method
2. **Tool Registration**: All tools registered with parameter schemas
3. **Request Handling**: MCP SDK handles protocol communication
4. **Authentication**: Each request authenticated before database access
5. **Response**: Structured responses with proper error handling

### Key Design Decisions

**Frontmatter in Documents**: YAML metadata at document start for AI instructions
```markdown
---
title: Document Title
ai_instructions: "Special handling notes"
tags: ["tag1", "tag2"]
---
```

**Link Syntax**: Internal document links use `[[document-name]]` format

**Context Aggregation**: Tools provide comprehensive context including related entities, statistics, and activity feeds

**Modular Tools**: Each tool file exports a tools array that gets spread into the main server configuration

## Development Guidelines

### Adding New Tools
1. Create new file in src/tools/ following existing patterns
2. Define Zod schemas for parameters and responses
3. Implement tool function with proper error handling
4. Export tools array
5. Import and spread in src/index.ts

### Database Changes
- Type definitions in src/lib/database-types.ts must match Supabase schema
- Use Zod schemas for runtime validation
- Always filter by user_id for data isolation

### Error Handling
- Use Winston logger (src/lib/logger.ts) for debugging
- Return user-friendly error messages in tool responses
- Never expose internal errors or sensitive data

### Testing MCP Tools
Manual testing via stdio interface:
```bash
npm start
# Send JSON-RPC requests to stdin
```

Or use MCP Inspector for interactive testing.