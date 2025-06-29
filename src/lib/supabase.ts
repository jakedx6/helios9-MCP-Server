import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database-types.js'
import { logger } from './logger.js'

// Re-export the database types for convenience
export type Project = Database['public']['Tables']['projects']['Row']
export type Task = Database['public']['Tables']['tasks']['Row'] 
export type Document = Database['public']['Tables']['documents']['Row']
export type Profile = Database['public']['Tables']['profiles']['Row']
export type AIConversation = Database['public']['Tables']['ai_conversations']['Row']

// Type aliases for inserts/updates
export type ProjectInsert = Database['public']['Tables']['projects']['Insert']
export type TaskInsert = Database['public']['Tables']['tasks']['Insert']
export type DocumentInsert = Database['public']['Tables']['documents']['Insert']

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

export interface TaskBoard {
  todo: Task[]
  in_progress: Task[]
  done: Task[]
  blocked?: Task[]
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

export class SupabaseService {
  private client: SupabaseClient
  private currentUserId: string | null = null

  constructor() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.')
    }

    this.client = createClient(supabaseUrl, supabaseKey)
    logger.info('Supabase client initialized')
  }

  /**
   * Authenticate with a user session token
   */
  async authenticate(accessToken: string): Promise<Profile> {
    try {
      const { data: { user }, error } = await this.client.auth.getUser(accessToken)
      
      if (error || !user) {
        throw new UnauthorizedError('Invalid access token')
      }

      this.currentUserId = user.id

      // Get user profile
      const { data: profile, error: profileError } = await this.client
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (profileError) {
        logger.error('Error fetching user profile:', profileError)
        throw new NotFoundError('User profile')
      }

      logger.info(`User authenticated: ${profile.email}`)
      return profile as Profile
    } catch (error) {
      logger.error('Authentication failed:', error)
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
   * Project operations
   */
  async getProjects(filter?: Filter, pagination?: Pagination, sort?: Sort): Promise<Project[]> {
    const userId = this.getCurrentUserId()
    
    let query = this.client
      .from('projects')
      .select('*')
      .eq('user_id', userId)

    // Apply filters
    if (filter?.status) {
      query = query.eq('status', filter.status)
    }
    if (filter?.search) {
      query = query.or(`name.ilike.%${filter.search}%,description.ilike.%${filter.search}%`)
    }
    if (filter?.created_after) {
      query = query.gte('created_at', filter.created_after)
    }
    if (filter?.created_before) {
      query = query.lte('created_at', filter.created_before)
    }

    // Apply sorting
    if (sort?.field) {
      query = query.order(sort.field, { ascending: sort.order === 'asc' })
    } else {
      query = query.order('updated_at', { ascending: false })
    }

    // Apply pagination
    if (pagination?.limit) {
      query = query.limit(pagination.limit)
    }
    if (pagination?.offset) {
      query = query.range(pagination.offset, pagination.offset + (pagination.limit || 20) - 1)
    }

    const { data, error } = await query

    if (error) {
      logger.error('Error fetching projects:', error)
      throw new HeliosError('Failed to fetch projects', 'DATABASE_ERROR', 500, error)
    }

    return data as Project[]
  }

  async getProject(projectId: string): Promise<Project> {
    const userId = this.getCurrentUserId()
    
    const { data, error } = await this.client
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('user_id', userId)
      .single()

    if (error || !data) {
      throw new NotFoundError('Project', projectId)
    }

    return data as Project
  }

  async createProject(projectData: Omit<Project, 'id' | 'created_at' | 'updated_at' | 'user_id'>): Promise<Project> {
    const userId = this.getCurrentUserId()
    
    const { data, error } = await this.client
      .from('projects')
      .insert({
        ...projectData,
        user_id: userId
      })
      .select()
      .single()

    if (error) {
      logger.error('Error creating project:', error)
      throw new HeliosError('Failed to create project', 'DATABASE_ERROR', 500, error)
    }

    logger.info(`Project created: ${data.name} (${data.id})`)
    return data as Project
  }

  async updateProject(projectId: string, updates: Partial<Project>): Promise<Project> {
    const userId = this.getCurrentUserId()
    
    const { data, error } = await this.client
      .from('projects')
      .update(updates)
      .eq('id', projectId)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        throw new NotFoundError('Project', projectId)
      }
      logger.error('Error updating project:', error)
      throw new HeliosError('Failed to update project', 'DATABASE_ERROR', 500, error)
    }

    return data as Project
  }

  /**
   * Task operations
   */
  async getTasks(filter?: Filter & { project_id?: string, assignee_id?: string }, pagination?: Pagination, sort?: Sort): Promise<Task[]> {
    const userId = this.getCurrentUserId()
    
    let query = this.client
      .from('tasks')
      .select(`
        *,
        project:projects!inner(id, name, user_id)
      `)
      .eq('project.user_id', userId)

    // Apply filters
    if (filter?.project_id) {
      query = query.eq('project_id', filter.project_id)
    }
    if (filter?.status) {
      query = query.eq('status', filter.status)
    }
    if (filter?.assignee_id) {
      query = query.eq('assignee_id', filter.assignee_id)
    }
    if (filter?.search) {
      query = query.or(`title.ilike.%${filter.search}%,description.ilike.%${filter.search}%`)
    }

    // Apply sorting and pagination
    if (sort?.field) {
      query = query.order(sort.field, { ascending: sort.order === 'asc' })
    } else {
      query = query.order('updated_at', { ascending: false })
    }

    if (pagination?.limit) {
      query = query.limit(pagination.limit)
    }

    const { data, error } = await query

    if (error) {
      logger.error('Error fetching tasks:', error)
      throw new HeliosError('Failed to fetch tasks', 'DATABASE_ERROR', 500, error)
    }

    return data as Task[]
  }

  async createTask(taskData: Omit<Task, 'id' | 'created_at' | 'updated_at' | 'created_by'>): Promise<Task> {
    const userId = this.getCurrentUserId()
    
    // Verify project ownership
    await this.getProject(taskData.project_id)
    
    const { data, error } = await this.client
      .from('tasks')
      .insert({
        ...taskData,
        created_by: userId
      })
      .select()
      .single()

    if (error) {
      logger.error('Error creating task:', error)
      throw new HeliosError('Failed to create task', 'DATABASE_ERROR', 500, error)
    }

    return data as Task
  }

  async updateTask(taskId: string, updates: Partial<Task>): Promise<Task> {
    const userId = this.getCurrentUserId()
    
    // First verify the user has access to this task
    const { data: existingTask } = await this.client
      .from('tasks')
      .select(`
        *,
        project:projects!inner(user_id)
      `)
      .eq('id', taskId)
      .eq('project.user_id', userId)
      .single()

    if (!existingTask) {
      throw new NotFoundError('Task', taskId)
    }

    const { data, error } = await this.client
      .from('tasks')
      .update(updates)
      .eq('id', taskId)
      .select()
      .single()

    if (error) {
      logger.error('Error updating task:', error)
      throw new HeliosError('Failed to update task', 'DATABASE_ERROR', 500, error)
    }

    return data as Task
  }

  /**
   * Document operations
   */
  async getDocuments(filter?: Filter & { project_id?: string, document_type?: string }, pagination?: Pagination, sort?: Sort): Promise<Document[]> {
    const userId = this.getCurrentUserId()
    
    let query = this.client
      .from('documents')
      .select(`
        *,
        project:projects(id, name),
        author:profiles(id, email, full_name)
      `)
      .eq('created_by', userId)

    // Apply filters
    if (filter?.project_id) {
      query = query.eq('project_id', filter.project_id)
    }
    if (filter?.type) {
      query = query.eq('document_type', filter.type)
    }
    if (filter?.search) {
      query = query.or(`title.ilike.%${filter.search}%,content.ilike.%${filter.search}%`)
    }

    // Apply sorting and pagination
    if (sort?.field) {
      query = query.order(sort.field, { ascending: sort.order === 'asc' })
    } else {
      query = query.order('updated_at', { ascending: false })
    }

    if (pagination?.limit) {
      query = query.limit(pagination.limit)
    }

    const { data, error } = await query

    if (error) {
      logger.error('Error fetching documents:', error)
      throw new HeliosError('Failed to fetch documents', 'DATABASE_ERROR', 500, error)
    }

    return data as Document[]
  }

  async getDocument(documentId: string): Promise<Document> {
    const userId = this.getCurrentUserId()
    
    const { data, error } = await this.client
      .from('documents')
      .select(`
        *,
        project:projects(id, name),
        author:profiles(id, email, full_name)
      `)
      .eq('id', documentId)
      .eq('created_by', userId)
      .single()

    if (error || !data) {
      throw new NotFoundError('Document', documentId)
    }

    return data as Document
  }

  async createDocument(documentData: Omit<Document, 'id' | 'created_at' | 'updated_at' | 'created_by'>): Promise<Document> {
    const userId = this.getCurrentUserId()
    
    // Verify project ownership if project_id is provided
    if (documentData.project_id) {
      await this.getProject(documentData.project_id)
    }
    
    const { data, error } = await this.client
      .from('documents')
      .insert({
        ...documentData,
        created_by: userId
      })
      .select(`
        *,
        project:projects(id, name),
        author:profiles(id, email, full_name)
      `)
      .single()

    if (error) {
      logger.error('Error creating document:', error)
      throw new HeliosError('Failed to create document', 'DATABASE_ERROR', 500, error)
    }

    return data as Document
  }

  async updateDocument(documentId: string, updates: Partial<Document>): Promise<Document> {
    const userId = this.getCurrentUserId()
    
    const { data, error } = await this.client
      .from('documents')
      .update(updates)
      .eq('id', documentId)
      .eq('created_by', userId)
      .select(`
        *,
        project:projects(id, name),
        author:profiles(id, email, full_name)
      `)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        throw new NotFoundError('Document', documentId)
      }
      logger.error('Error updating document:', error)
      throw new HeliosError('Failed to update document', 'DATABASE_ERROR', 500, error)
    }

    return data as Document
  }

  /**
   * Get comprehensive project context for AI agents
   */
  async getProjectContext(projectId: string): Promise<ProjectContext> {
    const project = await this.getProject(projectId)
    
    // Get statistics
    const [documents, tasks] = await Promise.all([
      this.getDocuments({ project_id: projectId }),
      this.getTasks({ project_id: projectId })
    ])

    // Calculate statistics
    const documentTypes = documents.reduce((acc, doc) => {
      acc[doc.document_type] = (acc[doc.document_type] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const taskStatus = tasks.reduce((acc, task) => {
      acc[task.status] = (acc[task.status] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    // Get recent items
    const recentDocuments = documents.slice(0, 5)
    const recentTasks = tasks.slice(0, 5)

    // Get team members (simplified - in real implementation, would fetch from project members)
    const teamMembers: Profile[] = []

    return {
      project,
      statistics: {
        total_documents: documents.length,
        total_tasks: tasks.length,
        document_types: documentTypes,
        task_status: taskStatus
      },
      recent_documents: recentDocuments,
      recent_tasks: recentTasks,
      team_members: teamMembers
    }
  }

  /**
   * Get task board for Kanban view
   */
  async getTaskBoard(projectId: string): Promise<TaskBoard> {
    const tasks = await this.getTasks({ project_id: projectId })
    
    return {
      todo: tasks.filter(t => t.status === 'todo'),
      in_progress: tasks.filter(t => t.status === 'in_progress'),
      done: tasks.filter(t => t.status === 'done'),
      // blocked: tasks.filter(t => t.status === 'blocked') // Blocked status not in schema
    }
  }

  /**
   * Additional methods needed by MCP tools
   */
  async getTask(taskId: string): Promise<Task> {
    const tasks = await this.getTasks()
    const task = tasks.find(t => t.id === taskId)
    if (!task) {
      throw new NotFoundError('Task', taskId)
    }
    return task
  }

  async updateTasksByProject(projectId: string, updates: Partial<Task>): Promise<void> {
    const userId = this.getCurrentUserId()
    
    const { error } = await this.client
      .from('tasks')
      .update(updates)
      .eq('project_id', projectId)
      .eq('created_by', userId)

    if (error) {
      logger.error('Error updating tasks by project:', error)
      throw new HeliosError('Failed to update tasks', 'DATABASE_ERROR', 500, error)
    }
  }

  // Placeholder methods for missing functionality
  async createTaskDependency(dependency: any): Promise<any> {
    logger.warn('Task dependencies not yet implemented in database schema')
    return { id: 'placeholder', ...dependency }
  }

  async getTaskDependencies(taskId: string): Promise<any[]> {
    logger.warn('Task dependencies not yet implemented in database schema')
    return []
  }

  async getProjectDependencies(projectId: string): Promise<any[]> {
    logger.warn('Project dependencies not yet implemented in database schema')
    return []
  }

  async createWorkflowRule(rule: any): Promise<any> {
    logger.warn('Workflow rules not yet implemented in database schema')
    return { id: 'placeholder', ...rule }
  }

  async getWorkflowRules(filter: any): Promise<any[]> {
    logger.warn('Workflow rules not yet implemented in database schema')
    return []
  }

  async getWorkflowRule(ruleId: string): Promise<any> {
    logger.warn('Workflow rules not yet implemented in database schema')
    return null
  }

  async logWorkflowExecution(execution: any): Promise<any> {
    logger.warn('Workflow execution logging not yet implemented')
    return { id: 'placeholder', ...execution }
  }

  async createTriggerAutomation(automation: any): Promise<any> {
    logger.warn('Trigger automations not yet implemented in database schema')
    return { id: 'placeholder', ...automation }
  }

  async getWorkflowExecutions(filter: any): Promise<any[]> {
    logger.warn('Workflow executions not yet implemented in database schema')
    return []
  }

  async createDocumentCollaboration(collaboration: any): Promise<any> {
    logger.warn('Document collaborations not yet implemented in database schema')
    return { id: 'placeholder', ...collaboration }
  }

  async getDocumentCollaborations(documentId: string): Promise<any[]> {
    logger.warn('Document collaborations not yet implemented in database schema')
    return []
  }
}

// Export singleton instance
export const supabaseService = new SupabaseService()