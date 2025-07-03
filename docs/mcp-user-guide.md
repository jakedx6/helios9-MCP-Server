# Helios-9 MCP Server User Guide

## Overview

The Helios-9 MCP (Model Context Protocol) server allows AI agents to interact directly with your project management data. This enables AI assistants like Claude Desktop to have persistent context about your projects, tasks, and documents across conversations.

## What is MCP?

Model Context Protocol (MCP) is an open standard that enables AI applications to securely connect to external data sources and tools. With Helios-9's MCP server, your AI assistant becomes a true team member with full context about your projects.

## Features

### 🎯 **Core Capabilities**
- **Project Management**: Create, update, and query projects
- **Task Operations**: Manage tasks with dependencies and workflows
- **Document Handling**: Create and analyze project documentation
- **AI Conversations**: Track and analyze AI interactions
- **Context Aggregation**: Smart insights across all project data
- **Search & Analytics**: Intelligent search and productivity insights
- **Workflow Automation**: Rule-based automation and triggers

### 🔧 **40+ Available Tools**

#### Project Tools
- `list_projects` - Get all projects
- `get_project` - Get detailed project info
- `create_project` - Create new projects
- `update_project` - Modify project details
- `get_project_context` - Get comprehensive project context
- `bulk_update_projects` - Update multiple projects

#### Task Tools
- `list_tasks` - Get tasks with filtering
- `create_task` - Create new tasks
- `update_task` - Modify tasks
- `bulk_update_tasks` - Update multiple tasks
- `add_task_dependency` - Create task dependencies

#### Document Tools
- `list_documents` - Get all documents
- `create_document` - Create new documents
- `update_document` - Modify documents
- `get_document_context` - Get document with analysis
- `analyze_document_content` - AI analysis of documents
- `bulk_document_operations` - Batch document operations

#### AI Conversation Tools
- `save_conversation` - Store AI conversations
- `get_conversations` - Retrieve conversation history
- `analyze_conversation` - Extract insights from conversations
- `extract_action_items` - Find actionable items
- `generate_conversation_summary` - Create summaries

#### Analytics & Insights Tools
- `generate_project_insights` - Get project analytics
- `get_productivity_metrics` - Track productivity
- `analyze_project_health` - Health scoring
- `get_team_collaboration_insights` - Team analytics

#### Search Tools
- `intelligent_search` - Search across all data
- `semantic_search` - AI-powered semantic search
- `search_with_filters` - Advanced filtered search

#### Context Aggregation Tools
- `find_related_content` - Find related items
- `generate_context_summary` - Create context summaries
- `cross_reference_entities` - Link related entities

#### Workflow Automation Tools
- `create_workflow_rule` - Set up automation
- `trigger_workflow` - Execute workflows
- `get_workflow_status` - Check workflow state

### 🌐 **Available Resources**

#### Real-time Data Access
- `helios9://projects` - All user projects
- `helios9://project/{id}/context` - Full project context
- `helios9://project/{id}/board` - Task board view
- `helios9://documents` - All documents
- `helios9://document/{id}` - Specific document content

### 💬 **Built-in Prompts**

#### Project Kickoff
Generate comprehensive project plans from natural language descriptions.

**Usage**: Ask your AI assistant to use the `project_kickoff` prompt
**Parameters**:
- `description`: Project description in plain English
- `team_size`: Number of team members (optional)
- `duration`: Expected timeline (optional)

#### Daily Standup
Create standup reports from recent project activity.

**Usage**: Request a `daily_standup` prompt
**Parameters**:
- `project_id`: Target project ID
- `date`: Date for the standup (optional)

#### Document Review
Generate detailed document reviews with suggestions.

**Usage**: Use the `document_review` prompt
**Parameters**:
- `document_id`: Document to review
- `review_type`: Type of review (technical, editorial, comprehensive)

## Getting Started

### Prerequisites
- Helios-9 account with projects and data
- AI assistant that supports MCP (e.g., Claude Desktop)
- Node.js 18+ installed locally

### Quick Setup

1. **Clone and Install**
   ```bash
   git clone <your-helios9-repo>
   cd helios9/packages/mcp-server
   npm install
   ```

2. **Configure Environment**
   ```bash
   # Copy environment template
   cp .env.example .env
   
   # Edit with your credentials
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_ACCESS_TOKEN=your_access_token
   ```

3. **Build the Server**
   ```bash
   npm run build
   ```

4. **Configure Your AI Assistant**
   
   For Claude Desktop, add to `claude_desktop_config.json`:
   ```json
   {
     "mcpServers": {
       "helios9": {
         "command": "node",
         "args": ["/path/to/helios9/packages/mcp-server/dist/index.js"]
       }
     }
   }
   ```

5. **Start Using**
   Restart your AI assistant and start asking about your projects!

## Example Conversations

### Project Management
```
You: "Show me my active projects"
AI: [Uses list_projects tool to get current projects]

You: "Create a new project for our mobile app redesign"
AI: [Uses create_project tool with your description]

You: "What's the status of project ABC-123?"
AI: [Uses get_project_context tool for comprehensive overview]
```

### Task Management
```
You: "Show me tasks for the website project"
AI: [Uses list_tasks tool to display tasks by status]

You: "Create a task to implement user authentication"
AI: [Uses create_task tool with details]

You: "What tasks are overdue?"
AI: [Uses list_tasks with date filters]
```

### Document Analysis
```
You: "Analyze my project requirements document"
AI: [Uses analyze_document_content for AI insights]

You: "Create a technical specification for the API"
AI: [Uses create_document with structured content]

You: "Find all documents related to authentication"
AI: [Uses intelligent_search across documents]
```

### Analytics & Insights
```
You: "How productive was I this week?"
AI: [Uses get_productivity_metrics for analysis]

You: "What's the health score of my main project?"
AI: [Uses analyze_project_health for assessment]

You: "Show me collaboration patterns on my team"
AI: [Uses get_team_collaboration_insights]
```

## Authentication

The MCP server supports multiple authentication methods:

### 1. Access Token (Recommended)
```bash
export SUPABASE_ACCESS_TOKEN=your_session_token
```

### 2. API Key
```bash
export MCP_API_KEY=your_api_key
export DEFAULT_USER_ID=your_user_id
```

### 3. Interactive Login
The server will prompt for authentication if no credentials are provided.

## Rate Limiting

- **Regular Users**: 100 requests per hour
- **Service Accounts**: 1000 requests per hour
- **Rate limit info**: Check headers in responses

## Error Handling

Common errors and solutions:

### Authentication Errors
```
Error: "No authenticated user"
Solution: Check your SUPABASE_ACCESS_TOKEN or MCP_API_KEY
```

### Permission Errors
```
Error: "Project not found"
Solution: Verify you have access to the project and the ID is correct
```

### Database Errors
```
Error: "Database connection failed"
Solution: Check your Supabase URL and credentials
```

## Best Practices

### 1. Context Management
- Use `get_project_context` for comprehensive project overview
- Leverage `find_related_content` to discover connections
- Save important conversations with `save_conversation`

### 2. Efficient Workflows
- Use bulk operations for multiple updates
- Set up workflow rules for automation
- Regularly analyze productivity metrics

### 3. Security
- Never share your access tokens
- Use API keys for service integrations
- Monitor usage through analytics

### 4. Performance
- Use filters to limit large data sets
- Cache frequently accessed data
- Batch similar operations together

## Troubleshooting

### Server Won't Start
1. Check Node.js version (requires 18+)
2. Verify all dependencies installed: `npm install`
3. Ensure environment variables are set
4. Check logs for specific error messages

### AI Assistant Can't Connect
1. Verify MCP server configuration path
2. Check that the server executable exists
3. Ensure proper permissions on the executable
4. Test server manually: `node dist/index.js`

### Data Not Loading
1. Verify Supabase connection
2. Check user authentication
3. Confirm database has data
4. Review network connectivity

### Performance Issues
1. Check database query performance
2. Monitor rate limits
3. Use appropriate filters
4. Consider data pagination

## Advanced Usage

### Custom Workflows
Create sophisticated automation rules:

```
You: "Create a workflow that assigns tasks to team members based on their skills"
AI: [Uses create_workflow_rule with skill-based logic]
```

### Cross-Project Analysis
Analyze data across multiple projects:

```
You: "Compare productivity across all my projects this month"
AI: [Uses generate_project_insights with cross-project analysis]
```

### Document Intelligence
Leverage AI for document insights:

```
You: "Extract all requirements from my project documents and create a requirements matrix"
AI: [Uses analyze_document_content and create_document for structured output]
```

## API Reference

For detailed API documentation, see:
- [MCP Tools Reference](./mcp-tools-reference.md)
- [MCP Resources Reference](./mcp-resources-reference.md)
- [MCP Prompts Reference](./mcp-prompts-reference.md)

## Support

For help and support:
- Check the [Troubleshooting Guide](./mcp-troubleshooting.md)
- Review [Common Use Cases](./mcp-use-cases.md)
- File issues on GitHub

## What's Next?

The Helios-9 MCP server is actively developed. Upcoming features:
- Real-time collaboration tools
- Advanced AI model integrations
- Enhanced workflow automation
- Mobile MCP client support