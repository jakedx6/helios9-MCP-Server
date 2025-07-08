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

### Project Hierarchy Structure
Helios-9 follows a three-level hierarchy for organizing work:
1. **Projects** → Top-level containers for related work
2. **Initiatives** → Strategic objectives within projects that group related tasks
3. **Tasks** → Individual work items that can belong to initiatives

**Important**: When creating tasks, always consider if they should be part of an initiative for better organization.

### MCP Protocol Implementation
The server implements MCP v2024-11-05 specification with three main capabilities:
1. **Tools**: Functions that AI agents can invoke (create_project, update_task, etc.)
2. **Resources**: Dynamic data endpoints that provide real-time information (24 resources!)
3. **Prompts**: Pre-defined templates for common AI workflows (9 specialized prompts!)

### Core Components

**Entry Points** (src/):
- `index.ts`: Full server with all tools including initiatives
- `index-minimal.ts`: Minimal server with core tools only

**Authentication Flow** (src/lib/auth.ts):
- Uses Helios-9 MCP API Keys (NOT LLM provider keys!)
- API Key authentication validates against Helios-9 API
- All operations performed in context of authenticated user
- Respects data isolation - users only see their own data

**Tool Organization** (src/tools/):
Each tool category handles specific domain logic:
- `projects.ts`: Project CRUD and context aggregation
- `initiatives.ts`: Initiative management for strategic planning
- `tasks.ts`: Task management with Kanban board support (now with initiative associations)
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

## Working with Initiatives

### When to Use Initiatives
Initiatives are strategic containers that group related tasks under a common objective. Use initiatives when:
- You have a multi-task effort toward a specific goal
- You need to track progress across multiple work items
- You want to organize tasks by strategic objectives
- You're planning features, epics, or major deliverables

### Creating the Hierarchy

**Best Practice Workflow**:
1. **Create Project** → Define the overall scope
2. **Create Initiatives** → Break down into strategic objectives
3. **Create Tasks** → Add specific work items to initiatives

**Example**:
```typescript
// 1. Create a project
const project = await create_project({
  name: "E-commerce Platform",
  description: "Build online shopping platform",
  status: "active"
})

// 2. Create initiatives within the project
const authInitiative = await create_initiative({
  name: "User Authentication System",
  objective: "Implement secure user authentication and authorization",
  project_ids: [project.id],
  owner_id: userId,
  priority: "high",
  status: "active"
})

// 3. Create tasks within the initiative
const task = await create_task({
  project_id: project.id,
  initiative_id: authInitiative.id,  // Link to initiative!
  title: "Implement JWT token generation",
  priority: "high"
})
```

### Initiative Tools Available

**Core Operations**:
- `list_initiatives` - List initiatives with filters (by project, status, priority)
- `get_initiative` - Get detailed initiative info including tasks and milestones
- `create_initiative` - Create new strategic initiative
- `update_initiative` - Update initiative details

**Advanced Features**:
- `get_initiative_context` - Get comprehensive context for AI understanding
- `get_initiative_insights` - Get AI-powered insights and recommendations
- `search_workspace` - Search across projects, initiatives, tasks, and documents
- `get_enhanced_project_context` - Get project context including all initiatives

### Tips for AI Agents

1. **Always Check for Initiatives**: When creating tasks, first check if relevant initiatives exist
2. **Group Related Work**: If creating multiple related tasks, consider creating an initiative first
3. **Use Context Tools**: Use `get_initiative_context` to understand the full scope before making changes
4. **Track Progress**: Initiatives automatically calculate completion based on their tasks

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


## MCP Prompts Available

The server provides 9 specialized prompts for AI-guided workflows:

### Planning & Strategy Prompts
1. **project_planning** - Generate comprehensive project plans with initiatives, tasks, and milestones
2. **initiative_strategy** - Create strategic plans for specific initiatives
3. **task_breakdown** - Convert features into actionable task lists
4. **sprint_planning** - Plan sprints based on current project state

### Analysis & Review Prompts
5. **project_health_check** - Analyze project health with recommendations
6. **document_review** - Review and improve documentation
7. **daily_standup** - Generate standup reports from activity
8. **project_kickoff** - Structure initial project setup

### Special Features
9. **helios9_personality** - Engage HELIOS-9's sardonic AI personality for insights

Each prompt is designed to work with the initiative hierarchy and provide actionable outputs that can be directly implemented using the MCP tools.

## MCP Resources Available

The server provides 24 resources for direct data access:

### Project Resources
- `helios9://projects` - List all projects
- `helios9://project/{id}/context` - Comprehensive project context
- `helios9://project/{id}/health` - Project health analysis
- `helios9://project/{id}/timeline` - Timeline with milestones

### Initiative Resources  
- `helios9://initiatives` - List all initiatives
- `helios9://initiatives?project_id={id}` - Initiatives for a project
- `helios9://initiative/{id}` - Initiative details
- `helios9://initiative/{id}/context` - Initiative context with insights

### Task Resources
- `helios9://tasks` - List all tasks
- `helios9://tasks?project_id={id}` - Tasks for a project
- `helios9://tasks?initiative_id={id}` - Tasks for an initiative
- `helios9://task/{id}` - Task details

### Document Resources
- `helios9://documents` - List all documents
- `helios9://documents?project_id={id}` - Documents for a project
- `helios9://document/{id}` - Document content (returns markdown)

### Workspace Resources
- `helios9://workspace/overview` - Workspace overview with analytics
- `helios9://workspace/analytics` - Detailed analytics and predictions

### Search Resources
- `helios9://search?q={query}` - Universal search across all entities
- `helios9://search/semantic?q={query}` - AI-powered semantic search

### Conversation Resources
- `helios9://conversations?project_id={id}` - AI conversations for a project
- `helios9://conversation/{id}` - Conversation with analysis

### Workflow Resources
- `helios9://workflows` - List workflow automation rules
- `helios9://workflow/{id}` - Workflow rule details

## Current Features vs Future Enhancements

### Currently Implemented ✅
- 21 working MCP tools (Projects, Initiatives, Tasks, Documents CRUD + advanced features)
- 9 MCP prompts for AI-guided project management workflows
- Full Projects → Initiatives → Tasks hierarchy support
- Helios-9 MCP API Key authentication
- LLM API key management in main app (OpenAI/Anthropic BYOK)
- AI chat features using BYOK keys (in main app, not MCP)
- Initiative management with context and insights
- Cross-entity search including initiatives

### Future Enhancements 🚧
- Semantic search using BYOK OpenAI embeddings
- AI conversation tracking via MCP
- Advanced analytics tools
- Workflow automation

## App Links
- Main SaaS app is at https://helios9.app (Note: use without www for API calls)