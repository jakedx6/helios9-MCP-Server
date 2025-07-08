import { logger } from './logger.js'

// Re-export types for backward compatibility
export type Project = {
  id: string
  user_id: string
  name: string
  description: string | null
  status: 'active' | 'archived' | 'completed'
  created_at: string
  updated_at: string
}

export type Task = {
  id: string
  project_id: string
  initiative_id: string | null
  title: string
  description: string | null
  status: 'todo' | 'in_progress' | 'done'
  priority: 'low' | 'medium' | 'high'
  due_date: string | null
  assignee_id: string | null
  created_at: string
  updated_at: string
  created_by: string
}

export type Document = {
  id: string
  project_id: string
  title: string
  content: string
  document_type: 'requirement' | 'design' | 'technical' | 'meeting_notes' | 'other'
  created_at: string
  updated_at: string
  created_by: string
}

export type Profile = {
  id: string
  created_at: string
  updated_at: string
  email: string
  username: string | null
  full_name: string | null
  avatar_url: string | null
  tenant_id: string | null
}

export type AIConversation = {
  id: string
  project_id: string
  user_id: string
  messages: any
  created_at: string
  updated_at: string
}

export type Initiative = {
  id: string
  name: string
  objective: string
  description: string | null
  status: 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled'
  priority: 'critical' | 'high' | 'medium' | 'low'
  project_ids: string[]
  owner_id: string
  start_date: string | null
  target_date: string | null
  created_at: string
  updated_at: string
  created_by: string
  tenant_id: string
}

export type InitiativeMilestone = {
  id: string
  initiative_id: string
  name: string
  description: string | null
  target_date: string
  completed_date: string | null
  status: 'pending' | 'in_progress' | 'completed' | 'missed'
  order_index: number
  created_by: string
  created_at: string
  updated_at: string
}

// Type aliases for inserts/updates
export type ProjectInsert = Omit<Project, 'id' | 'user_id' | 'created_at' | 'updated_at'>
export type TaskInsert = Omit<Task, 'id' | 'created_at' | 'updated_at' | 'created_by'>
export type DocumentInsert = Omit<Document, 'id' | 'created_at' | 'updated_at' | 'created_by'>
export type InitiativeInsert = Omit<Initiative, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'tenant_id'>
export type InitiativeMilestoneInsert = Omit<InitiativeMilestone, 'id' | 'created_at' | 'updated_at' | 'created_by'>

// Additional types for complex operations
export interface ProjectContext {
  project: Project
  statistics: {
    total_documents: number
    total_tasks: number
    document_types: Record<string, number>
    task_status: Record<string, number>
  }
  recent_documents: Document[]
  recent_tasks: Task[]
  team_members: Profile[]
}


export interface Filter {
  status?: string
  search?: string
  created_after?: string
  created_before?: string
  type?: string
  project_id?: string
  assignee_id?: string
}

export interface Pagination {
  limit?: number
  offset?: number
}

export interface Sort {
  field?: string
  order?: 'asc' | 'desc'
}

// Error classes
export class HeliosError extends Error {
  constructor(
    public message: string,
    public code: string = 'UNKNOWN_ERROR',
    public statusCode: number = 500,
    public originalError?: any
  ) {
    super(message)
    this.name = 'HeliosError'
  }
}

export class NotFoundError extends HeliosError {
  constructor(resource: string, id?: string) {
    super(
      `${resource}${id ? ` with ID ${id}` : ''} not found`,
      'NOT_FOUND',
      404
    )
  }
}

export class UnauthorizedError extends HeliosError {
  constructor(message: string = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401)
  }
}

export class ValidationError extends HeliosError {
  constructor(message: string, field?: string) {
    super(message, 'VALIDATION_ERROR', 400)
    if (field) {
      this.message = `${field}: ${message}`
    }
  }
}

export class ApiClient {
  private baseUrl: string
  private apiKey: string
  private currentUserId: string | null = null
  private currentTenantId: string | null = null

  constructor() {
    const baseUrl = process.env.HELIOS_API_URL
    const apiKey = process.env.HELIOS_API_KEY

    // Provide detailed error information
    if (!baseUrl) {
      logger.error('HELIOS_API_URL environment variable is not set')
      throw new Error('Missing HELIOS_API_URL environment variable. This should be set in your MCP client configuration (e.g., Claude Desktop config).')
    }

    if (!apiKey) {
      logger.error('HELIOS_API_KEY environment variable is not set')
      throw new Error('Missing HELIOS_API_KEY environment variable. This should be set in your MCP client configuration (e.g., Claude Desktop config).')
    }

    this.baseUrl = baseUrl.replace(/\/$/, '') // Remove trailing slash
    this.apiKey = apiKey
    logger.info('Helios API client initialized', { 
      baseUrl: this.baseUrl,
      keyPrefix: this.apiKey.substring(0, 16) + '...', // Log partial key for debugging
      keyLength: this.apiKey.length,
      envBaseUrl: process.env.HELIOS_API_URL,
      envKeyLength: process.env.HELIOS_API_KEY?.length
    })
  }

  /**
   * Make authenticated API request
   */
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    
    const config: RequestInit = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'X-MCP-Client': 'helios9-mcp-server',
        ...options.headers,
      },
    }

    try {
      const headers = config.headers as Record<string, string>
      logger.info(`API Request: ${config.method || 'GET'} ${url}`, {
        hasAuth: !!headers?.['Authorization'],
        authPrefix: headers?.['Authorization']?.substring(0, 20) + '...'
      })
      
      const response = await fetch(url, config)
      
      logger.info(`API Response: ${response.status} ${response.statusText}`, {
        url,
        ok: response.ok
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        let errorData: any
        
        try {
          errorData = JSON.parse(errorText)
        } catch {
          errorData = { message: errorText }
        }

        logger.error(`API Error: ${response.status} ${response.statusText}`, { 
          url, 
          error: errorData 
        })

        switch (response.status) {
          case 401:
            throw new UnauthorizedError(errorData.message || 'Invalid API key')
          case 404:
            throw new NotFoundError('Resource')
          case 400:
            throw new ValidationError(errorData.message || 'Validation failed')
          default:
            throw new HeliosError(
              errorData.message || `API request failed: ${response.status}`,
              'API_ERROR',
              response.status,
              errorData
            )
        }
      }

      const data = await response.json()
      return data
    } catch (error) {
      if (error instanceof HeliosError) {
        throw error
      }
      
      logger.error(`API Request failed: ${url}`, error)
      throw new HeliosError(
        `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'NETWORK_ERROR',
        500,
        error
      )
    }
  }

  /**
   * Authenticate with API key (validates the key and gets user info)
   */
  async authenticate(): Promise<Profile> {
    try {
      const response = await this.request<{ user: Profile }>('/api/auth/validate', {
        method: 'POST',
      })

      this.currentUserId = response.user.id
      this.currentTenantId = response.user.tenant_id || null
      logger.info(`API authenticated for user: ${response.user.email}, tenant: ${response.user.tenant_id || 'none'}`)
      return response.user
    } catch (error) {
      logger.error('API authentication failed:', error)
      throw error instanceof HeliosError ? error : new UnauthorizedError()
    }
  }

  /**
   * Get current user ID
   */
  getCurrentUserId(): string {
    if (!this.currentUserId) {
      throw new UnauthorizedError('No authenticated user')
    }
    return this.currentUserId
  }

  /**
   * Get current tenant ID
   */
  getCurrentTenantId(): string | null {
    return this.currentTenantId
  }

  /**
   * Project operations
   */
  async getProjects(filter?: Filter, pagination?: Pagination, sort?: Sort): Promise<Project[]> {
    const params = new URLSearchParams()
    
    if (filter?.status) params.append('status', filter.status)
    if (filter?.search) params.append('search', filter.search)
    if (filter?.created_after) params.append('created_after', filter.created_after)
    if (filter?.created_before) params.append('created_before', filter.created_before)
    if (pagination?.limit) params.append('limit', pagination.limit.toString())
    if (pagination?.offset) params.append('offset', pagination.offset.toString())
    if (sort?.field) params.append('sort_field', sort.field)
    if (sort?.order) params.append('sort_order', sort.order)

    const queryString = params.toString()
    const endpoint = `/api/mcp/projects${queryString ? `?${queryString}` : ''}`
    
    const response = await this.request<{ projects: Project[] }>(endpoint)
    return response.projects
  }

  async getProject(projectId: string): Promise<Project> {
    const response = await this.request<{ project: Project }>(`/api/mcp/projects/${projectId}`)
    return response.project
  }

  async createProject(projectData: ProjectInsert): Promise<Project> {
    const response = await this.request<{ project: Project }>('/api/mcp/projects', {
      method: 'POST',
      body: JSON.stringify(projectData),
    })
    
    logger.info(`Project created: ${response.project.name} (${response.project.id})`)
    return response.project
  }

  async updateProject(projectId: string, updates: Partial<Project>): Promise<Project> {
    const response = await this.request<{ project: Project }>(`/api/mcp/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    })
    
    return response.project
  }

  /**
   * Task operations
   */
  async getTasks(filter?: Filter & { project_id?: string; assignee_id?: string }, pagination?: Pagination, sort?: Sort): Promise<Task[]> {
    const params = new URLSearchParams()
    
    if (filter?.project_id) params.append('project_id', filter.project_id)
    if (filter?.status) params.append('status', filter.status)
    if (filter?.assignee_id) params.append('assignee_id', filter.assignee_id)
    if (filter?.search) params.append('search', filter.search)
    if (pagination?.limit) params.append('limit', pagination.limit.toString())
    if (pagination?.offset) params.append('offset', pagination.offset.toString())
    if (sort?.field) params.append('sort_field', sort.field)
    if (sort?.order) params.append('sort_order', sort.order)

    const queryString = params.toString()
    const endpoint = `/api/mcp/tasks${queryString ? `?${queryString}` : ''}`
    
    const response = await this.request<{ tasks: Task[] }>(endpoint)
    return response.tasks
  }

  async getTask(taskId: string): Promise<Task> {
    const response = await this.request<{ task: Task }>(`/api/mcp/tasks/${taskId}`)
    return response.task
  }

  async createTask(taskData: TaskInsert): Promise<Task> {
    const response = await this.request<{ task: Task }>('/api/mcp/tasks', {
      method: 'POST',
      body: JSON.stringify(taskData),
    })
    
    return response.task
  }

  async updateTask(taskId: string, updates: Partial<Task>): Promise<Task> {
    const response = await this.request<{ task: Task }>(`/api/mcp/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    })
    
    return response.task
  }

  /**
   * Document operations
   */
  async getDocuments(filter?: Filter & { project_id?: string; document_type?: string }, pagination?: Pagination, sort?: Sort): Promise<Document[]> {
    const params = new URLSearchParams()
    
    if (filter?.project_id) params.append('project_id', filter.project_id)
    if (filter?.type) params.append('document_type', filter.type)
    if (filter?.search) params.append('search', filter.search)
    if (pagination?.limit) params.append('limit', pagination.limit.toString())
    if (pagination?.offset) params.append('offset', pagination.offset.toString())
    if (sort?.field) params.append('sort_field', sort.field)
    if (sort?.order) params.append('sort_order', sort.order)

    const queryString = params.toString()
    const endpoint = `/api/mcp/documents${queryString ? `?${queryString}` : ''}`
    
    const response = await this.request<{ documents: Document[] }>(endpoint)
    return response.documents
  }

  async getDocument(documentId: string): Promise<Document> {
    const response = await this.request<{ document: Document }>(`/api/mcp/documents/${documentId}`)
    return response.document
  }

  async createDocument(documentData: DocumentInsert): Promise<Document> {
    const response = await this.request<{ document: Document }>('/api/mcp/documents', {
      method: 'POST',
      body: JSON.stringify(documentData),
    })
    
    return response.document
  }

  async updateDocument(documentId: string, updates: Partial<Document>): Promise<Document> {
    const response = await this.request<{ document: Document }>(`/api/mcp/documents/${documentId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    })
    
    return response.document
  }

  /**
   * Get comprehensive project context for AI agents
   */
  async getProjectContext(projectId: string): Promise<ProjectContext> {
    const response = await this.request<{ context: ProjectContext }>(`/api/mcp/projects/${projectId}/context`)
    return response.context
  }

  /**
   * Initiative operations
   */
  async getInitiatives(filter?: Filter & { project_id?: string; status?: string; priority?: string }, pagination?: Pagination, sort?: Sort): Promise<Initiative[]> {
    const params = new URLSearchParams()
    
    if (filter?.project_id) params.append('project_id', filter.project_id)
    if (filter?.status) params.append('status', filter.status)
    if (filter?.priority) params.append('priority', filter.priority)
    if (filter?.search) params.append('search', filter.search)
    if (pagination?.limit) params.append('limit', pagination.limit.toString())
    if (pagination?.offset) params.append('offset', pagination.offset.toString())
    if (sort?.field) params.append('sort_field', sort.field)
    if (sort?.order) params.append('sort_order', sort.order)

    const queryString = params.toString()
    const endpoint = `/api/mcp/initiatives${queryString ? `?${queryString}` : ''}`
    
    const response = await this.request<{ initiatives: Initiative[] }>(endpoint)
    return response.initiatives
  }

  async getInitiative(initiativeId: string): Promise<Initiative> {
    const response = await this.request<{ initiative: Initiative }>(`/api/mcp/initiatives/${initiativeId}`)
    return response.initiative
  }

  async createInitiative(initiativeData: InitiativeInsert): Promise<Initiative> {
    const response = await this.request<{ initiative: Initiative }>('/api/mcp/initiatives', {
      method: 'POST',
      body: JSON.stringify(initiativeData),
    })
    
    logger.info(`Initiative created: ${response.initiative.name} (${response.initiative.id})`)
    return response.initiative
  }

  async updateInitiative(initiativeId: string, updates: Partial<Initiative>): Promise<Initiative> {
    const response = await this.request<{ initiative: Initiative }>(`/api/mcp/initiatives/${initiativeId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    })
    
    return response.initiative
  }

  async getInitiativeContext(initiativeId: string): Promise<any> {
    const response = await this.request<{ context: any }>(`/api/mcp/initiatives/${initiativeId}/context`)
    return response.context
  }

  async getInitiativeInsights(initiativeId: string): Promise<any> {
    const response = await this.request<{ insights: any }>(`/api/mcp/initiatives/${initiativeId}/insights`)
    return response.insights
  }

  async searchWorkspace(query: string, filters?: any, limit?: number): Promise<any> {
    const response = await this.request<any>('/api/mcp/search', {
      method: 'POST',
      body: JSON.stringify({ query, filters, limit }),
    })
    return response
  }

  async getEnhancedProjectContext(projectId: string): Promise<any> {
    const response = await this.request<{ context: any }>(`/api/mcp/projects/${projectId}/context-enhanced`)
    return response.context
  }

  async getWorkspaceContext(): Promise<any> {
    const response = await this.request<{ context: any }>('/api/mcp/workspace/context')
    return response.context
  }


  /**
   * Additional methods for MCP compatibility
   */
  async updateTasksByProject(projectId: string, updates: Partial<Task>): Promise<void> {
    await this.request(`/api/mcp/projects/${projectId}/tasks`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    })
  }

  // Placeholder methods for missing functionality
  async createTaskDependency(dependency: any): Promise<any> {
    logger.warn('Task dependencies not yet implemented in API')
    return { id: 'placeholder', ...dependency }
  }

  async getTaskDependencies(taskId: string): Promise<any[]> {
    logger.warn('Task dependencies not yet implemented in API')
    return []
  }

  async getProjectDependencies(projectId: string): Promise<any[]> {
    logger.warn('Project dependencies not yet implemented in API')
    return []
  }

  async createWorkflowRule(rule: any): Promise<any> {
    logger.warn('Workflow rules not yet implemented in API')
    return { id: 'placeholder', ...rule }
  }

  async getWorkflowRules(filter: any): Promise<any[]> {
    logger.warn('Workflow rules not yet implemented in API')
    return []
  }

  async getWorkflowRule(ruleId: string): Promise<any> {
    logger.warn('Workflow rules not yet implemented in API')
    return null
  }

  async logWorkflowExecution(execution: any): Promise<any> {
    logger.warn('Workflow execution logging not yet implemented in API')
    return { id: 'placeholder', ...execution }
  }

  async createTriggerAutomation(automation: any): Promise<any> {
    logger.warn('Trigger automations not yet implemented in API')
    return { id: 'placeholder', ...automation }
  }

  async getWorkflowExecutions(filter: any): Promise<any[]> {
    logger.warn('Workflow executions not yet implemented in API')
    return []
  }

  async createDocumentCollaboration(collaboration: any): Promise<any> {
    logger.warn('Document collaborations not yet implemented in API')
    return { id: 'placeholder', ...collaboration }
  }

  async getDocumentCollaborations(documentId: string): Promise<any[]> {
    logger.warn('Document collaborations not yet implemented in API')
    return []
  }
}

// Export singleton instance (lazy initialization)
let _apiClient: ApiClient | null = null

export function getApiClient(): ApiClient {
  if (!_apiClient) {
    _apiClient = new ApiClient()
  }
  return _apiClient
}

// For backward compatibility
export const apiClient = new Proxy({} as ApiClient, {
  get(target, prop, receiver) {
    return Reflect.get(getApiClient(), prop, receiver)
  }
})

// Maintain backward compatibility by aliasing the service
export const supabaseService = apiClient