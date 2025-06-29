import { z } from 'zod'

// Base entity types
export const BaseEntitySchema = z.object({
  id: z.string().uuid(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

export type BaseEntity = z.infer<typeof BaseEntitySchema>

// User/Profile types
export const ProfileSchema = BaseEntitySchema.extend({
  email: z.string().email(),
  full_name: z.string().nullable(),
  avatar_url: z.string().url().nullable(),
  role: z.enum(['admin', 'member', 'viewer']).default('member'),
})

export type Profile = z.infer<typeof ProfileSchema>

// Project types
export const ProjectStatusSchema = z.enum(['active', 'completed', 'archived', 'on_hold'])
export const ProjectPrioritySchema = z.enum(['low', 'medium', 'high', 'urgent'])

export const ProjectSchema = BaseEntitySchema.extend({
  name: z.string().min(1).max(255),
  description: z.string().nullable(),
  status: ProjectStatusSchema.default('active'),
  priority: ProjectPrioritySchema.default('medium'),
  owner_id: z.string().uuid(),
  metadata: z.record(z.any()).default({}),
})

export type Project = z.infer<typeof ProjectSchema>
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>
export type ProjectPriority = z.infer<typeof ProjectPrioritySchema>

// Task types
export const TaskStatusSchema = z.enum(['todo', 'in_progress', 'done', 'blocked'])
export const TaskPrioritySchema = z.enum(['low', 'medium', 'high', 'urgent'])

export const TaskSchema = BaseEntitySchema.extend({
  title: z.string().min(1).max(500),
  description: z.string().nullable(),
  status: TaskStatusSchema.default('todo'),
  priority: TaskPrioritySchema.default('medium'),
  project_id: z.string().uuid(),
  assignee_id: z.string().uuid().nullable(),
  creator_id: z.string().uuid(),
  due_date: z.string().datetime().nullable(),
  completed_at: z.string().datetime().nullable(),
  metadata: z.record(z.any()).default({}),
})

export type Task = z.infer<typeof TaskSchema>
export type TaskStatus = z.infer<typeof TaskStatusSchema>
export type TaskPriority = z.infer<typeof TaskPrioritySchema>

// Document types
export const DocumentTypeSchema = z.enum([
  'readme',
  'api_docs',
  'meeting_notes',
  'technical_spec',
  'general'
])

export const DocumentFormatSchema = z.enum(['markdown', 'plaintext', 'html'])
export const DocumentStatusSchema = z.enum(['draft', 'review', 'published', 'archived'])

export const DocumentSchema = BaseEntitySchema.extend({
  title: z.string().min(1).max(500),
  content: z.string(),
  document_type: DocumentTypeSchema,
  format: DocumentFormatSchema.default('markdown'),
  status: DocumentStatusSchema.default('draft'),
  project_id: z.string().uuid().nullable(),
  author_id: z.string().uuid(),
  metadata: z.record(z.any()).default({}),
  version_number: z.number().int().positive().default(1),
})

export type Document = z.infer<typeof DocumentSchema>
export type DocumentType = z.infer<typeof DocumentTypeSchema>
export type DocumentFormat = z.infer<typeof DocumentFormatSchema>
export type DocumentStatus = z.infer<typeof DocumentStatusSchema>

// Document Version types
export const DocumentVersionSchema = BaseEntitySchema.extend({
  document_id: z.string().uuid(),
  content: z.string(),
  metadata: z.record(z.any()).default({}),
  version_number: z.number().int().positive(),
  created_by: z.string().uuid(),
})

export type DocumentVersion = z.infer<typeof DocumentVersionSchema>

// AI Conversation types
export const MessageRoleSchema = z.enum(['user', 'assistant', 'system'])

export const MessageSchema = z.object({
  role: MessageRoleSchema,
  content: z.string(),
  timestamp: z.string().datetime(),
  metadata: z.record(z.any()).default({}),
})

export const AIConversationSchema = BaseEntitySchema.extend({
  project_id: z.string().uuid(),
  title: z.string().max(500),
  messages: z.array(MessageSchema),
  metadata: z.record(z.any()).default({}),
})

export type Message = z.infer<typeof MessageSchema>
export type MessageRole = z.infer<typeof MessageRoleSchema>
export type AIConversation = z.infer<typeof AIConversationSchema>

// MCP-specific types
export const MCPToolSchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.record(z.any()),
})

export const MCPResourceSchema = z.object({
  uri: z.string(),
  name: z.string(),
  description: z.string().optional(),
  mimeType: z.string().optional(),
})

export const MCPPromptSchema = z.object({
  name: z.string(),
  description: z.string(),
  arguments: z.array(z.object({
    name: z.string(),
    description: z.string(),
    required: z.boolean().default(false),
  })).default([]),
})

export type MCPTool = z.infer<typeof MCPToolSchema>
export type MCPResource = z.infer<typeof MCPResourceSchema>
export type MCPPrompt = z.infer<typeof MCPPromptSchema>

// API Response types
export const APIResponseSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: z.string().optional(),
  message: z.string().optional(),
  timestamp: z.string().datetime().default(() => new Date().toISOString()),
})

export type APIResponse<T = any> = {
  success: boolean
  data?: T
  error?: string
  message?: string
  timestamp: string
}

// Search and filtering types
export const SortOrderSchema = z.enum(['asc', 'desc'])

export const PaginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
  offset: z.number().int().nonnegative().optional(),
})

export const FilterSchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  type: z.string().optional(),
  project_id: z.string().uuid().optional(),
  created_after: z.string().datetime().optional(),
  created_before: z.string().datetime().optional(),
  updated_after: z.string().datetime().optional(),
  updated_before: z.string().datetime().optional(),
})

export const SortSchema = z.object({
  field: z.string(),
  order: SortOrderSchema.default('desc'),
})

export type Pagination = z.infer<typeof PaginationSchema>
export type Filter = z.infer<typeof FilterSchema>
export type Sort = z.infer<typeof SortSchema>
export type SortOrder = z.infer<typeof SortOrderSchema>

// MCP Context types for AI agents
export const ProjectContextSchema = z.object({
  project: ProjectSchema,
  statistics: z.object({
    total_documents: z.number().int().nonnegative(),
    total_tasks: z.number().int().nonnegative(),
    document_types: z.record(z.number().int().nonnegative()),
    task_status: z.record(z.number().int().nonnegative()),
  }),
  recent_documents: z.array(DocumentSchema),
  recent_tasks: z.array(TaskSchema),
  team_members: z.array(ProfileSchema),
})

export const TaskBoardSchema = z.object({
  todo: z.array(TaskSchema),
  in_progress: z.array(TaskSchema),
  done: z.array(TaskSchema),
  blocked: z.array(TaskSchema).optional(),
})

export type ProjectContext = z.infer<typeof ProjectContextSchema>
export type TaskBoard = z.infer<typeof TaskBoardSchema>

// Error types
export class HeliosError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message)
    this.name = 'HeliosError'
  }
}

export class ValidationError extends HeliosError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', 400, details)
    this.name = 'ValidationError'
  }
}

export class NotFoundError extends HeliosError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} with id ${id} not found` : `${resource} not found`
    super(message, 'NOT_FOUND', 404)
    this.name = 'NotFoundError'
  }
}

export class UnauthorizedError extends HeliosError {
  constructor(message: string = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401)
    this.name = 'UnauthorizedError'
  }
}

export class ForbiddenError extends HeliosError {
  constructor(message: string = 'Forbidden') {
    super(message, 'FORBIDDEN', 403)
    this.name = 'ForbiddenError'
  }
}

// Utility types
export type CreateInput<T> = Omit<T, keyof BaseEntity>
export type UpdateInput<T> = Partial<Omit<T, 'id' | 'created_at'>>

// Re-export commonly used schemas for validation
export {
  ProjectSchema,
  TaskSchema,
  DocumentSchema,
  ProfileSchema,
  APIResponseSchema,
  PaginationSchema,
  FilterSchema,
  SortSchema,
}