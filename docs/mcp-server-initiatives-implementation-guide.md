# Helios9 MCP Server - Initiatives Feature Implementation Guide

This guide provides detailed instructions for implementing support for the new Initiatives feature in the Helios9 MCP server. The initiatives feature introduces a new hierarchy level: **Projects > Initiatives > Tasks**, allowing for better organization and strategic planning.

## Overview

The Initiatives feature adds a strategic planning layer between projects and tasks, enabling:
- Grouping related tasks under strategic objectives
- Tracking progress across multiple related work items
- Managing milestones and deliverables
- Providing AI-powered insights and recommendations

## Database Schema Requirements

Before implementing the MCP endpoints, ensure the following tables exist in your Supabase database:

### initiatives
```sql
- id (uuid, primary key)
- name (text, required)
- objective (text, required) 
- description (text, nullable)
- status (text) - values: 'planning', 'active', 'on_hold', 'completed', 'cancelled'
- priority (text) - values: 'critical', 'high', 'medium', 'low'
- project_ids (uuid[], required) - array of associated project IDs
- owner_id (uuid, references profiles.id)
- start_date (timestamp, nullable)
- target_date (timestamp, nullable)
- created_at (timestamp)
- updated_at (timestamp)
- created_by (uuid, references auth.users.id)
- tenant_id (uuid, required)
```

### initiative_milestones
```sql
- id (uuid, primary key)
- initiative_id (uuid, references initiatives.id)
- name (text, required)
- description (text, nullable)
- target_date (timestamp, required)
- completed_date (timestamp, nullable)
- status (text) - values: 'pending', 'in_progress', 'completed', 'missed'
- order_index (integer, default 0)
- created_by (uuid, references auth.users.id)
- created_at (timestamp)
- updated_at (timestamp)
```

### initiative_documents
```sql
- id (uuid, primary key)
- initiative_id (uuid, references initiatives.id)
- document_id (uuid, references documents.id)
- added_by (uuid, references auth.users.id)
- added_at (timestamp)
```

### tasks (modified)
```sql
- Add column: initiative_id (uuid, nullable, references initiatives.id)
```

## New MCP Tools to Implement

### 1. list_initiatives
**Purpose**: List all initiatives with optional filtering

**HTTP Endpoint**: `GET /api/mcp/initiatives`

**Query Parameters**:
- `project_id` (optional) - Filter by project
- `status` (optional) - Filter by status
- `priority` (optional) - Filter by priority

**Response Schema**:
```typescript
{
  initiatives: Array<{
    id: string
    name: string
    objective: string
    description: string | null
    status: string
    priority: string
    project_ids: string[]
    owner_id: string
    owner: {
      id: string
      email: string
      full_name: string | null
      avatar_url: string | null
    }
    start_date: string | null
    target_date: string | null
    created_at: string
    updated_at: string
    tenant_id: string
    task_count: number
    milestone_count: number
    document_count: number
  }>
}
```

### 2. get_initiative
**Purpose**: Get detailed information about a specific initiative

**HTTP Endpoint**: `GET /api/mcp/initiatives/{id}`

**Response Schema**:
```typescript
{
  initiative: {
    id: string
    name: string
    objective: string
    description: string | null
    status: string
    priority: string
    project_ids: string[]
    owner_id: string
    owner: { /* owner details */ }
    start_date: string | null
    target_date: string | null
    created_at: string
    updated_at: string
    tenant_id: string
    completion_percentage: number
    tasks: Array<{ /* task details */ }>
    milestones: Array<{ /* milestone details */ }>
    documents: Array<{ /* document details */ }>
    statistics: {
      total_tasks: number
      completed_tasks: number
      total_milestones: number
      completed_milestones: number
      total_documents: number
    }
  }
}
```

### 3. update_initiative
**Purpose**: Update initiative details

**HTTP Endpoint**: `PATCH /api/mcp/initiatives/{id}`

**Request Body**:
```typescript
{
  name?: string
  objective?: string
  description?: string
  status?: string
  priority?: string
  project_ids?: string[]
  owner_id?: string
  start_date?: string
  target_date?: string
}
```

### 4. get_initiative_context
**Purpose**: Get rich context about an initiative for AI understanding

**HTTP Endpoint**: `GET /api/mcp/initiatives/{id}/context`

**Response Schema**:
```typescript
{
  context: {
    initiative: { /* core initiative data */ }
    projects: Array<{ /* associated projects */ }>
    statistics: {
      total_tasks: number
      completed_tasks: number
      total_milestones: number
      completed_milestones: number
      total_documents: number
      task_status: Record<string, number>
      task_priority: Record<string, number>
      milestone_status: Record<string, number>
      overdue_tasks: number
      overdue_milestones: number
    }
    progress: {
      overall_percentage: number
      task_completion_rate: number
      milestone_completion_rate: number
      health_status: 'healthy' | 'needs-attention' | 'at-risk'
      days_elapsed: number
      days_remaining: number | null
      is_overdue: boolean
    }
    recent_activity: {
      tasks: Array<{ /* recent task updates */ }>
      milestones: Array<{ /* recent milestone updates */ }>
      documents: Array<{ /* recently added documents */ }>
    }
    team: {
      owner: { /* owner details */ }
      contributors: Array<{
        id: string
        email: string
        full_name: string | null
        avatar_url: string | null
        task_count: number
      }>
    }
  }
}
```

### 5. get_initiative_insights
**Purpose**: Get AI-powered insights and recommendations for an initiative

**HTTP Endpoint**: `GET /api/mcp/initiatives/{id}/insights`

**Response Schema**:
```typescript
{
  insights: {
    summary: {
      description: string
      health_assessment: string
      key_achievements: string[]
      current_focus: string
    }
    recommendations: Array<{
      type: 'action' | 'warning' | 'opportunity'
      title: string
      description: string
      priority: 'high' | 'medium' | 'low'
      suggested_action?: string
    }>
    predictions: {
      completion_forecast: {
        estimated_date: string | null
        confidence: 'high' | 'medium' | 'low'
        factors: string[]
      }
      risk_areas: Array<{
        area: string
        likelihood: 'high' | 'medium' | 'low'
        impact: 'high' | 'medium' | 'low'
        mitigation: string
      }>
    }
    patterns: {
      productivity_trends: {
        trend: 'improving' | 'stable' | 'declining'
        details: string
      }
      bottlenecks: string[]
      success_patterns: string[]
    }
  }
}
```

### 6. search_workspace
**Purpose**: Search across all entity types with initiative awareness

**HTTP Endpoint**: `POST /api/mcp/search`

**Request Body**:
```typescript
{
  query: string
  filters?: {
    type?: 'project' | 'initiative' | 'task' | 'document' | 'milestone'
    project_id?: string
    initiative_id?: string
    status?: string
  }
  limit?: number
}
```

**Response Schema**:
```typescript
{
  results: Array<{
    type: 'project' | 'initiative' | 'task' | 'document' | 'milestone'
    id: string
    title: string
    description: string | null
    metadata: {
      status?: string
      priority?: string
      project_name?: string
      initiative_name?: string
      assignee?: string
      due_date?: string
      target_date?: string
      document_type?: string
    }
    relevance_score: number
    context_path: string[]
  }>
  total_count: number
  suggestions: string[]
}
```

### 7. get_enhanced_project_context
**Purpose**: Get project context including all initiatives

**HTTP Endpoint**: `GET /api/mcp/projects/{id}/context-enhanced`

**Response Schema**:
```typescript
{
  context: {
    project: { /* project details */ }
    initiatives: Array<{
      id: string
      name: string
      objective: string
      description: string | null
      status: string
      priority: string
      start_date: string | null
      target_date: string | null
      owner_id: string
      created_at: string
      updated_at: string
      task_count: number
      milestone_count: number
      document_count: number
      completion_percentage: number
    }>
    statistics: {
      total_documents: number
      total_tasks: number
      total_initiatives: number
      total_milestones: number
      document_types: Record<string, number>
      task_status: Record<string, number>
      task_by_initiative: Record<string, number>
      initiative_status: Record<string, number>
    }
    recent_activity: {
      tasks: Array<{ /* with initiative_name */ }>
      documents: Array<{ /* with initiative_associations */ }>
      milestones: Array<{ /* milestone activities */ }>
    }
    team_members: Array<{ /* team member details */ }>
    hierarchy: {
      project: {
        id: string
        name: string
        initiatives: Array<{
          id: string
          name: string
          tasks: Array<{ id: string, title: string, status: string }>
          milestones: Array<{ id: string, name: string, status: string }>
        }>
      }
    }
  }
}
```

### 8. get_workspace_context
**Purpose**: Get complete workspace hierarchy and insights

**HTTP Endpoint**: `GET /api/mcp/workspace/context`

**Response Schema**:
```typescript
{
  context: {
    summary: {
      total_projects: number
      total_initiatives: number
      total_tasks: number
      total_documents: number
      active_users: number
    }
    hierarchy: Array<{
      project: {
        id: string
        name: string
        description: string | null
        status: string
      }
      initiatives: Array<{
        id: string
        name: string
        objective: string
        status: string
        priority: string
        completion_percentage: number
        task_count: number
        milestone_count: number
      }>
      standalone_tasks: number
      documents: number
    }>
    recent_activity: Array<{
      type: string
      entity_type: string
      entity_id: string
      entity_name: string
      project_name: string
      initiative_name?: string
      timestamp: string
      actor?: string
    }>
    insights: {
      most_active_initiatives: Array<{
        id: string
        name: string
        activity_score: number
      }>
      at_risk_items: Array<{
        type: string
        id: string
        name: string
        reason: string
      }>
      upcoming_deadlines: Array<{
        type: string
        id: string
        name: string
        due_date: string
        days_until_due: number
      }>
    }
  }
}
```

## Modified Existing Tools

### get_project_context
The existing `get_project_context` tool should be updated to include basic initiative information:
- Add `initiative_count` to statistics
- Include initiative names in task metadata where applicable

### list_tasks / get_task
These tools should be updated to include:
- `initiative_id` field in task data
- `initiative_name` in response when initiative is associated

## Implementation Notes

### Authentication
All endpoints must use the existing MCP authentication via `authenticateMcpApiKey()` to ensure:
- Valid API key verification
- Tenant isolation
- User context extraction

### Tenant Isolation
Every query must include tenant filtering:
```typescript
.eq('tenant_id', tenantId || userId)
```

### Error Handling
Consistent error responses:
- 401 for authentication failures
- 404 for not found resources
- 500 for server errors

### Performance Considerations
1. Use parallel queries with `Promise.all()` where possible
2. Limit default result sets (e.g., 20 items)
3. Include pagination support for list endpoints
4. Use database indexes on:
   - `initiatives.tenant_id`
   - `initiatives.project_ids` (GIN index for array)
   - `tasks.initiative_id`
   - `initiative_milestones.initiative_id`

### Response Formatting
1. Always return counts instead of full arrays for nested relations
2. Use consistent date formatting (ISO 8601)
3. Include calculation fields (e.g., `completion_percentage`)
4. Provide meaningful null/empty responses

## Testing Checklist

- [ ] All endpoints respect tenant isolation
- [ ] Proper error handling for edge cases
- [ ] Response schemas match documentation
- [ ] Performance under load (100+ initiatives)
- [ ] Cascading updates work correctly
- [ ] Search includes all entity types
- [ ] Insights generate meaningful recommendations
- [ ] Context endpoints provide complete hierarchy

## Migration Path

1. Deploy database schema changes
2. Update MCP server with new endpoints
3. Test with small subset of data
4. Update AI prompts to understand initiatives
5. Roll out to users with feature flag
6. Monitor usage and performance

## Example Usage in AI Context

```typescript
// AI Assistant fetching project context
const projectContext = await mcp.get_enhanced_project_context({ id: projectId })

// Understanding the hierarchy
projectContext.hierarchy.project.initiatives.forEach(initiative => {
  console.log(`Initiative: ${initiative.name}`)
  console.log(`  Tasks: ${initiative.tasks.length}`)
  console.log(`  Milestones: ${initiative.milestones.length}`)
})

// Getting actionable insights
const insights = await mcp.get_initiative_insights({ id: initiativeId })
insights.recommendations.filter(r => r.priority === 'high').forEach(rec => {
  console.log(`Action needed: ${rec.title}`)
  console.log(`Suggestion: ${rec.suggested_action}`)
})

// Smart search across workspace
const results = await mcp.search_workspace({ 
  query: "authentication", 
  filters: { type: "task" } 
})
```

This implementation will enable AI assistants to fully understand and work with the Project > Initiative > Tasks hierarchy, providing intelligent insights and recommendations based on the workspace structure.