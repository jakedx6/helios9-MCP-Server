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

## CRITICAL: API Key Types - DO NOT CONFUSE

There are TWO completely different types of API keys in the Helios-9 ecosystem:

### 1. **Helios-9 MCP API Keys** (Required for MCP Server)
- **Purpose**: Authenticate the MCP server to access user's Helios-9 data
- **Format**: `hel9_[32-character-hex]` (e.g., `hel9_59805140fd5b0a3b25efa9081eb3cf840db7dc70...`)
- **Generated from**: Helios-9 app → Settings → API Keys
- **Used in**: `HELIOS_API_KEY` environment variable
- **Stored in**: `mcp_api_keys` table (hashed)
- **Function**: Allows MCP server to perform CRUD operations on projects, tasks, documents

### 2. **LLM Provider API Keys** (BYOK - Bring Your Own Key)
- **Purpose**: Power AI features like chat, task generation, and future semantic search
- **Formats**: 
  - OpenAI: `sk-...` 
  - Anthropic: `sk-ant-...`
- **Generated from**: Provider's platform (OpenAI/Anthropic)
- **Managed in**: Helios-9 app → Settings → AI Provider Configuration
- **Stored in**: `api_keys` table (AES-256-CBC encrypted)
- **Function**: Enables AI-powered features, user pays provider directly

**NEVER mix these up - they serve completely different purposes!**

## Architecture Overview

This is a Model Context Protocol (MCP) server that provides AI agents with structured access to project management functionality. The architecture follows these key principles:

### MCP Protocol Implementation
The server implements MCP v2024-11-05 specification with three main capabilities:
1. **Tools**: Functions that AI agents can invoke (create_project, update_task, etc.)
2. **Resources**: Dynamic data endpoints that provide real-time information
3. **Prompts**: Pre-defined templates for common AI workflows

### Core Components

**Entry Points** (src/):
- `index.ts`: Full server with all 12 working tools
- `index-minimal.ts`: Minimal server with core tools only

**Authentication Flow** (src/lib/auth.ts):
- Uses Helios-9 MCP API Keys (NOT LLM provider keys!)
- API Key authentication validates against Helios-9 API
- All operations performed in context of authenticated user
- Respects data isolation - users only see their own data

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


## Current Features vs Future Enhancements

### Currently Implemented ✅
- 12 working MCP tools (Projects, Tasks, Documents CRUD)
- Helios-9 MCP API Key authentication
- LLM API key management in main app (OpenAI/Anthropic BYOK)
- AI chat features using BYOK keys (in main app, not MCP)

### Future Enhancements 🚧
- Semantic search using BYOK OpenAI embeddings
- AI conversation tracking via MCP
- Advanced analytics tools
- Workflow automation

## App Links
- Main SaaS app is at https://helios9.app (Note: use without www for API calls)