# Helios-9 MCP Tools Reference

This document provides detailed information about all available MCP tools in the Helios-9 server.

## Project Management Tools

### `list_projects`
**Description**: Retrieve all projects for the authenticated user with optional filtering and sorting.

**Parameters**:
```typescript
{
  status?: "active" | "completed" | "archived" | "on_hold"
  search?: string           // Search in name/description
  limit?: number           // Max results (default: 20)
  offset?: number          // Pagination offset
  sort_by?: "name" | "created_at" | "updated_at"
  sort_order?: "asc" | "desc"
}
```

**Returns**: Array of Project objects
```typescript
Project[] = {
  id: string
  name: string
  description: string | null
  status: "active" | "completed" | "archived"
  created_at: string
  updated_at: string
  user_id: string
}
```

**Example Usage**:
```
"Show me all my active projects sorted by name"
-> Uses list_projects with {status: "active", sort_by: "name"}
```

### `get_project`
**Description**: Get detailed information about a specific project.

**Parameters**:
```typescript
{
  project_id: string       // UUID of the project
}
```

**Returns**: Detailed project object with related data
```typescript
{
  project: Project
  task_summary: {
    total: number
    todo: number
    in_progress: number
    done: number
  }
  document_summary: {
    total: number
    by_type: Record<string, number>
  }
  recent_activity: ActivityItem[]
}
```

### `create_project`
**Description**: Create a new project with AI-generated structure.

**Parameters**:
```typescript
{
  name: string            // Project name
  description: string     // Project description
  template?: "basic" | "software" | "marketing" | "research"
  auto_create_structure?: boolean  // Auto-create initial tasks/docs
}
```

**Returns**: Created project with generated structure

### `update_project`
**Description**: Update project details and metadata.

**Parameters**:
```typescript
{
  project_id: string
  name?: string
  description?: string
  status?: "active" | "completed" | "archived" | "on_hold"
  metadata?: Record<string, any>
}
```

### `get_project_context`
**Description**: Get comprehensive project context for AI analysis.

**Parameters**:
```typescript
{
  project_id: string
  include_tasks?: boolean     // Include task details
  include_documents?: boolean // Include document content
  include_conversations?: boolean // Include AI conversations
  depth?: "shallow" | "deep"  // Level of detail
}
```

**Returns**: Rich project context object with all related data

### `bulk_update_projects`
**Description**: Update multiple projects simultaneously.

**Parameters**:
```typescript
{
  project_ids: string[]
  updates: {
    status?: string
    priority?: "low" | "medium" | "high" | "urgent"
    metadata?: Record<string, any>
  }
  reason?: string  // Reason for bulk update
}
```

## Task Management Tools

### `list_tasks`
**Description**: Get tasks with advanced filtering and search capabilities.

**Parameters**:
```typescript
{
  project_id?: string
  status?: "todo" | "in_progress" | "done"
  priority?: "low" | "medium" | "high"
  assignee_id?: string
  due_date_before?: string  // ISO date
  due_date_after?: string   // ISO date
  search?: string
  limit?: number
  offset?: number
}
```

**Returns**: Array of task objects with project context

### `create_task`
**Description**: Create a new task with intelligent categorization.

**Parameters**:
```typescript
{
  project_id: string
  title: string
  description?: string
  priority?: "low" | "medium" | "high"
  due_date?: string        // ISO date
  assignee_id?: string
  dependencies?: string[]  // Task IDs this depends on
  auto_schedule?: boolean  // AI-powered scheduling
}
```

### `update_task`
**Description**: Update task details and track changes.

**Parameters**:
```typescript
{
  task_id: string
  title?: string
  description?: string
  status?: "todo" | "in_progress" | "done"
  priority?: "low" | "medium" | "high"
  due_date?: string
  assignee_id?: string
  completion_notes?: string
}
```


### `bulk_update_tasks`
**Description**: Update multiple tasks at once.

**Parameters**:
```typescript
{
  task_ids: string[]
  updates: {
    status?: string
    priority?: string
    assignee_id?: string
    due_date?: string
  }
  reason?: string
}
```

### `add_task_dependency`
**Description**: Create dependencies between tasks.

**Parameters**:
```typescript
{
  task_id: string        // Dependent task
  depends_on: string     // Task it depends on
  dependency_type?: "finish_to_start" | "start_to_start" | "finish_to_finish"
}
```

## Document Management Tools

### `list_documents`
**Description**: Get documents with content search and filtering.

**Parameters**:
```typescript
{
  project_id?: string
  document_type?: "requirement" | "design" | "technical" | "meeting_notes" | "other"
  search?: string          // Full-text search
  created_after?: string   // ISO date
  limit?: number
  include_content?: boolean // Include full content
}
```

### `create_document`
**Description**: Create a new document with AI assistance.

**Parameters**:
```typescript
{
  project_id: string
  title: string
  content: string
  document_type: "requirement" | "design" | "technical" | "meeting_notes" | "other"
  template?: string        // Auto-apply template
  auto_analyze?: boolean   // Run AI analysis
}
```

### `update_document`
**Description**: Update document content and metadata.

**Parameters**:
```typescript
{
  document_id: string
  title?: string
  content?: string
  document_type?: string
  track_changes?: boolean  // Version tracking
}
```

### `get_document_context`
**Description**: Get document with AI analysis and related content.

**Parameters**:
```typescript
{
  document_id: string
  include_analysis?: boolean    // AI content analysis
  include_related?: boolean     // Related documents/tasks
  analysis_type?: "summary" | "requirements" | "technical" | "full"
}
```

**Returns**: Document with rich analysis
```typescript
{
  document: Document
  analysis: {
    word_count: number
    reading_time: number
    key_topics: string[]
    sentiment: "positive" | "neutral" | "negative"
    complexity_score: number
    ai_readiness_score: number
  }
  related_content: {
    tasks: Task[]
    documents: Document[]
    conversations: AIConversation[]
  }
}
```

### `analyze_document_content`
**Description**: Perform AI analysis on document content.

**Parameters**:
```typescript
{
  document_id: string
  analysis_types: ("summary" | "key_points" | "requirements" | "action_items" | "risks")[]
  context?: "technical" | "business" | "user_experience"
}
```

### `bulk_document_operations`
**Description**: Perform operations on multiple documents.

**Parameters**:
```typescript
{
  document_ids: string[]
  operation: "analyze" | "export" | "archive" | "tag"
  parameters?: Record<string, any>
}
```

## AI Conversation Tools

### `save_conversation`
**Description**: Save an AI conversation with project context.

**Parameters**:
```typescript
{
  project_id: string
  title?: string           // Auto-generated if not provided
  messages: {
    role: "user" | "assistant" | "system"
    content: string
    timestamp?: string
    metadata?: Record<string, any>
  }[]
  context?: {
    task_id?: string
    document_id?: string
    conversation_type: "task_discussion" | "document_review" | "project_planning" | "troubleshooting" | "general"
    ai_model?: string
    temperature?: number
    tokens_used?: number
  }
  metadata?: Record<string, any>
}
```

### `get_conversations`
**Description**: Retrieve AI conversations with filtering.

**Parameters**:
```typescript
{
  project_id: string
  limit?: number
  conversation_type?: "task_discussion" | "document_review" | "project_planning" | "troubleshooting" | "general"
  related_to?: string      // task_id or document_id
  include_messages?: boolean
}
```

### `analyze_conversation`
**Description**: Extract insights from AI conversations.

**Parameters**:
```typescript
{
  conversation_id: string
}
```

**Returns**: Comprehensive conversation analysis
```typescript
{
  conversation_flow: {
    turn_taking: number
    longest_response: number
    conversation_rhythm: string
  }
  content_analysis: {
    message_count: number
    total_words: number
    questions_asked: number
    code_examples: number
  }
  ai_performance: {
    response_count: number
    avg_response_length: number
    helpful_responses: number
  }
  topic_modeling: string[]
  action_items: ActionItem[]
  decisions_made: string[]
  questions_raised: string[]
  knowledge_gaps: string[]
}
```

### `extract_action_items`
**Description**: Extract actionable items from conversations.

**Parameters**:
```typescript
{
  conversation_id: string
  auto_create_tasks?: boolean  // Create tasks automatically
}
```

### `generate_conversation_summary`
**Description**: Create summaries of AI conversations.

**Parameters**:
```typescript
{
  conversation_id: string
  summary_type: "brief" | "detailed" | "action_items" | "decisions"
}
```

## Analytics & Insights Tools

### `generate_project_insights`
**Description**: Generate comprehensive project analytics.

**Parameters**:
```typescript
{
  project_id: string
  time_range?: "7d" | "30d" | "90d" | "1y"
  insight_types?: ("health" | "productivity" | "collaboration" | "risks" | "recommendations")[]
}
```

**Returns**: Rich analytics dashboard data
```typescript
{
  health_score: number     // 0-100
  productivity_metrics: {
    tasks_completed: number
    avg_completion_time: number
    velocity_trend: "up" | "down" | "stable"
  }
  collaboration_insights: {
    active_contributors: number
    communication_frequency: number
    knowledge_sharing_score: number
  }
  risk_analysis: {
    overdue_tasks: number
    resource_constraints: string[]
    timeline_risks: string[]
  }
  recommendations: string[]
}
```

### `get_productivity_metrics`
**Description**: Get detailed productivity analytics.

**Parameters**:
```typescript
{
  user_id?: string         // Defaults to current user
  project_id?: string      // Specific project or all
  time_range?: "7d" | "30d" | "90d"
  metric_types?: ("tasks" | "documents" | "conversations" | "collaboration")[]
}
```

### `analyze_project_health`
**Description**: Assess project health and identify issues.

**Parameters**:
```typescript
{
  project_id: string
  health_factors?: ("timeline" | "resources" | "quality" | "communication" | "risks")[]
}
```

### `get_team_collaboration_insights`
**Description**: Analyze team collaboration patterns.

**Parameters**:
```typescript
{
  project_id?: string
  time_range?: "7d" | "30d" | "90d"
  include_ai_interactions?: boolean
}
```

## Search Tools

### `intelligent_search`
**Description**: AI-powered search across all project data.

**Parameters**:
```typescript
{
  query: string
  scope?: "projects" | "tasks" | "documents" | "conversations" | "all"
  project_id?: string      // Limit to specific project
  filters?: {
    date_range?: [string, string]
    content_type?: string[]
    priority?: string
  }
  limit?: number
  semantic?: boolean       // Use semantic search
}
```

**Returns**: Ranked search results with relevance scores
```typescript
{
  results: {
    type: "project" | "task" | "document" | "conversation"
    id: string
    title: string
    content_snippet: string
    relevance_score: number
    match_highlights: string[]
    related_items: string[]
  }[]
  total_results: number
  search_time_ms: number
  suggestions: string[]
}
```

### `semantic_search`
**Description**: Advanced semantic search using AI embeddings.

**Parameters**:
```typescript
{
  query: string
  embedding_model?: "openai" | "local"
  similarity_threshold?: number  // 0-1
  max_results?: number
}
```

### `search_with_filters`
**Description**: Advanced filtered search with multiple criteria.

**Parameters**:
```typescript
{
  filters: {
    content_type: string[]
    date_range: [string, string]
    status: string[]
    priority: string[]
    assignee: string[]
    tags: string[]
  }
  sort_by?: "relevance" | "date" | "priority"
  faceted?: boolean        // Return filter counts
}
```

## Context Aggregation Tools

### `find_related_content`
**Description**: Find content related to a specific item.

**Parameters**:
```typescript
{
  entity_id: string
  entity_type: "project" | "task" | "document" | "conversation"
  relation_types?: ("similar" | "referenced" | "dependent" | "contextual")[]
  limit?: number
}
```

### `generate_context_summary`
**Description**: Create intelligent summaries from multiple sources.

**Parameters**:
```typescript
{
  context_items: {
    type: string
    id: string
    weight?: number        // Importance weight
  }[]
  summary_type: "executive" | "technical" | "status" | "comprehensive"
  target_audience?: "technical" | "business" | "general"
}
```

### `cross_reference_entities`
**Description**: Find connections between different entities.

**Parameters**:
```typescript
{
  primary_entity: {
    type: string
    id: string
  }
  search_scope?: string[]
  connection_types?: ("direct" | "indirect" | "semantic")[]
}
```

## Workflow Automation Tools

### `create_workflow_rule`
**Description**: Set up automated workflow rules.

**Parameters**:
```typescript
{
  name: string
  trigger: {
    event: "task_created" | "task_completed" | "document_updated" | "project_status_changed"
    conditions?: Record<string, any>
  }
  actions: {
    type: "create_task" | "send_notification" | "update_status" | "assign_user"
    parameters: Record<string, any>
  }[]
  enabled?: boolean
}
```

### `trigger_workflow`
**Description**: Manually trigger a workflow.

**Parameters**:
```typescript
{
  workflow_id: string
  context?: Record<string, any>
  dry_run?: boolean        // Test without executing
}
```

### `get_workflow_status`
**Description**: Get status of workflow executions.

**Parameters**:
```typescript
{
  workflow_id?: string     // Specific workflow or all
  execution_id?: string    // Specific execution
  time_range?: "24h" | "7d" | "30d"
}
```

## Error Handling

All tools return consistent error formats:

```typescript
{
  error: string           // Human-readable error message
  code: string           // Error code for programmatic handling
  details?: any          // Additional error details
  timestamp: string      // ISO timestamp
  tool: string          // Tool name that generated error
}
```

Common error codes:
- `NOT_FOUND`: Resource doesn't exist
- `UNAUTHORIZED`: Authentication required
- `FORBIDDEN`: Insufficient permissions
- `VALIDATION_ERROR`: Invalid parameters
- `DATABASE_ERROR`: Database operation failed
- `RATE_LIMITED`: Too many requests

## Rate Limits

- **Standard**: 100 requests/hour
- **Bulk Operations**: Count as multiple requests
- **Search Operations**: 50 requests/hour
- **AI Analysis**: 20 requests/hour

Rate limit headers:
- `X-RateLimit-Limit`: Requests allowed per window
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: Window reset time