# Helios-9 MCP Server

An AI-native Model Context Protocol (MCP) server that provides comprehensive project management context to AI agents. Built for seamless integration with Claude, OpenAI, and other AI systems via the **Helios-9 API**.

## 📌 Current Status

**Version**: 1.0.0  
**Stability**: Ready for Core Features  
**Active Tools**: 12 (Projects, Tasks, Documents CRUD operations)  
**API Integration**: ✅ Fully integrated with Helios-9 SaaS API

## 🌟 Features

### Core Capabilities
- **Project Management**: Create, read, update projects with full context
- **Task Operations**: Kanban boards, task creation, status tracking
- **Document Management**: Markdown documents with frontmatter metadata
- **AI Integration**: Structured metadata for optimal AI collaboration
- **Real-time Context**: Live project statistics and activity feeds

### MCP Protocol Support
- **Tools**: 12 core tools for project, task, and document operations
- **Resources**: Dynamic project and document resources (coming soon)
- **Prompts**: AI-optimized prompt templates (coming soon)

### AI-First Design
- **Frontmatter Support**: YAML metadata for AI instructions
- **Link Analysis**: Internal document linking with `[[document-name]]` syntax
- **Basic Search**: Keyword search across projects, tasks, and documents
- **Semantic Search**: Coming soon with Supabase pgvector integration

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- Access to Helios-9 main application with API key generation
- MCP-compatible AI client (Claude Desktop, OpenAI, etc.)

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your Helios-9 API configuration
   ```

3. **Build the server:**
   ```bash
   npm run build
   ```

4. **Start the server:**
   ```bash
   npm start
   ```

### Environment Variables

```bash
# Required - Helios-9 API Configuration
HELIOS_API_URL=https://www.helios9.app
HELIOS_API_KEY=your_generated_api_key

# Optional
LOG_LEVEL=info
NODE_ENV=development
```

## 🔑 API Key Generation

### From Helios-9 Main Application

1. **Login to your Helios-9 application**
2. **Navigate to Settings > API Keys**
3. **Click "Generate New API Key"**
4. **Copy the generated key** (it will only be shown once)
5. **Set permissions** for the key (read/write access to projects, tasks, documents)
6. **Add the key to your MCP server environment**

### API Key Permissions

Your API key controls access to:
- **Projects**: Create, read, update, delete projects
- **Tasks**: Manage tasks within your projects  
- **Documents**: Create and manage project documentation
- **Analytics**: Access project insights and metrics

## 📋 Available Tools

### ✅ Project Tools
- `list_projects` - List all projects with filtering
- `get_project` - Get detailed project information
- `create_project` - Create new project
- `update_project` - Update existing project

### ✅ Task Tools
- `list_tasks` - List tasks with filtering
- `get_task` - Get specific task details
- `create_task` - Create new task
- `update_task` - Update task status/details

### ✅ Document Tools
- `list_documents` - List documents with filtering
- `get_document` - Get specific document
- `create_document` - Create markdown document (requires project_id)
- `update_document` - Update document content

**Note**: All tools require proper API key authentication and respect user-level data isolation.

### 🚧 Coming Soon
- Semantic search across all content
- Task dependencies and workflows
- AI conversation tracking
- Advanced analytics and insights
- Document collaboration features

## 🔗 Resources & Prompts (Coming Soon)

MCP Resources and Prompts are planned features that will enable:
- Dynamic resource URIs for direct content access
- AI-optimized prompt templates for common workflows
- Context-aware project planning assistance

## 🔧 Integration Examples

### Claude Desktop Configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "helios9": {
      "command": "node",
      "args": ["/path/to/helios9-MCP-Server/dist/index.js"],
      "env": {
        "HELIOS_API_URL": "https://www.helios9.app",
        "HELIOS_API_KEY": "your_generated_api_key"
      }
    }
  }
}
```

### Cline/Continue Integration

```json
{
  "mcpServers": {
    "helios9": {
      "command": "node",
      "args": ["/path/to/helios9-MCP-Server/dist/index.js"],
      "env": {
        "HELIOS_API_URL": "https://www.helios9.app", 
        "HELIOS_API_KEY": "your_generated_api_key"
      }
    }
  }
}
```

### OpenAI Integration

```python
from mcp import MCPClient
import os

# Set environment variables
os.environ["HELIOS_API_URL"] = "https://www.helios9.app"
os.environ["HELIOS_API_KEY"] = "your_generated_api_key"

client = MCPClient()
client.connect_stdio("node", ["/path/to/dist/index.js"])

# List projects
projects = client.call_tool("list_projects", {})

# Create task
task = client.call_tool("create_task", {
    "project_id": "uuid",
    "title": "Implement user authentication",
    "priority": "high"
})
```

## 📊 Data Models

### Project
```typescript
interface Project {
  id: string
  user_id: string
  name: string
  description?: string
  status: 'active' | 'completed' | 'archived'
  created_at: string
  updated_at: string
}
```

### Task
```typescript
interface Task {
  id: string
  title: string
  description?: string
  status: 'todo' | 'in_progress' | 'done'
  priority: 'low' | 'medium' | 'high'
  project_id: string
  assignee_id?: string
  due_date?: string
  created_at: string
  updated_at: string
  created_by: string
}
```

### Document
```typescript
interface Document {
  id: string
  title: string
  content: string  // Markdown with frontmatter
  document_type: 'requirement' | 'design' | 'technical' | 'meeting_notes' | 'note' | 'other'
  project_id: string  // Required
  created_at: string
  updated_at: string
  created_by: string
}
```

## 🔒 Security

### Authentication
- **API Key Authentication**: Generated from your Helios-9 application
- **Secure Storage**: API keys are securely stored and managed in Helios-9
- **User Context**: All operations are performed in the context of the API key owner

### Data Access
- **User Isolation**: API enforces user-level data access controls
- **Permission-based**: API keys can have granular permissions
- **Audit Logging**: All API calls are logged for security and debugging

### Rate Limiting
- **API-level**: Rate limiting is enforced by the Helios-9 API
- **Per-key Limits**: Different limits can be set per API key
- **Configurable**: Limits can be adjusted in the Helios-9 admin panel

## 🧪 Development

### Running in Development
```bash
npm run dev        # Watch mode with auto-reload
npm run build      # Production build
npm run start      # Start production server
```

## 🏗️ Architecture

### API-First Design
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   AI Client     │────│  Helios-9 MCP    │────│  Helios-9 API   │
│  (Claude, etc.) │    │     Server       │    │   Application   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                               │                          │
                       ┌───────▼──────────┐              │
                       │  Authentication  │              │
                       │   (API Key)      │              │
                       └──────────────────┘              │
                                                         │
                                                ┌────────▼────────┐
                                                │    Database     │
                                                └─────────────────┘
```

### Benefits of API Integration
- **Centralized Auth**: Authentication handled by main application
- **Consistent Data**: Single source of truth for all data
- **Security**: API-level security controls and monitoring
- **Scalability**: Can serve multiple MCP clients
- **Maintainability**: Single codebase for data operations

## 📈 Monitoring

### Health Checks
The server provides health information through logging:
- API connection status
- Authentication state
- Tool execution metrics
- Error rates and types

### Metrics Available
- Tool call frequency
- Response times
- Authentication success/failure
- API endpoint usage patterns

## 🛠️ Troubleshooting

### Common Issues

**Authentication Failed**
```bash
# Check API key validity
curl -H "Authorization: Bearer YOUR_API_KEY" https://www.helios9.app/api/auth/validate
```

**Connection Issues**
```bash
# Verify API URL is accessible
curl https://www.helios9.app/api/health
```

**Permission Errors**
- Check API key permissions in Helios-9 admin panel
- Ensure key has access to required resources (projects, tasks, documents)

### Log Analysis
```bash
# Enable debug logging
LOG_LEVEL=debug npm start

# Look for API-specific errors
grep "API Error" logs/*.log
```

## 🤝 Contributing

### Development Setup
1. Fork the repository
2. Create feature branch  
3. Make changes with tests
4. Submit pull request

### Code Style
- TypeScript strict mode
- ESLint configuration
- Prettier formatting
- Conventional commits

## 📝 License

This project is part of the Helios-9 platform. See the main project LICENSE for details.

## 🆘 Support

### Documentation
- [MCP Protocol Specification](https://modelcontextprotocol.io/)

### Community
- GitHub Issues for bugs and features
- Discussions for questions and ideas
- Discord for real-time chat

---

**Built with ❤️ for the AI-native future of project management**

## 🚀 Roadmap

### Coming Soon
- **Semantic Search**: AI-powered search using OpenAI embeddings and Supabase pgvector
- **Task Dependencies**: Link related tasks and track workflows
- **AI Conversations**: Save and analyze AI agent interactions
- **Advanced Analytics**: Project insights and productivity metrics
- **Bulk Operations**: Update multiple items at once
- **Workflow Automation**: Trigger-based task creation and updates

### Future Vision
- Multi-agent collaboration support
- Custom tool creation framework
- Integration with popular project management tools
- Real-time collaboration features