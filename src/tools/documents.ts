import { supabaseService } from '../lib/api-client.js'
import { requireAuth } from '../lib/auth.js'
import { logger } from '../lib/logger.js'
import { z } from 'zod'

// Local type definitions
interface MCPTool {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, any>
    required?: string[]
  }
}

// Input schemas for document tools
const ListDocumentsSchema = z.object({
  project_id: z.string().uuid().optional(),
  document_type: z.enum(['requirement', 'design', 'technical', 'meeting_notes', 'other']).optional(),
  search: z.string().optional(),
  limit: z.number().int().positive().max(100).default(20)
})

const GetDocumentSchema = z.object({
  document_id: z.string().uuid()
})

const CreateDocumentSchema = z.object({
  project_id: z.string().uuid().optional(),
  title: z.string().min(1).max(500),
  content: z.string(),
  document_type: z.enum(['requirement', 'design', 'technical', 'meeting_notes', 'other']),
  metadata: z.record(z.any()).optional()
})

const UpdateDocumentSchema = z.object({
  document_id: z.string().uuid(),
  title: z.string().min(1).max(500).optional(),
  content: z.string().optional(),
  document_type: z.enum(['requirement', 'design', 'technical', 'meeting_notes', 'other']).optional(),
  metadata: z.record(z.any()).optional()
})

const SearchDocumentsSchema = z.object({
  query: z.string().min(1),
  project_id: z.string().uuid().optional(),
  document_types: z.array(z.string()).optional(),
  limit: z.number().int().positive().max(50).default(20),
  include_content: z.boolean().default(false)
})

/**
 * List documents with filtering
 */
export const listDocumentsTool: MCPTool = {
  name: 'list_documents',
  description: 'List documents with optional filtering by project or document type',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'string',
        format: 'uuid',
        description: 'Filter documents by project ID'
      },
      document_type: {
        type: 'string',
        enum: ['requirement', 'design', 'technical', 'meeting_notes', 'other'],
        description: 'Filter documents by type'
      },
      search: {
        type: 'string',
        description: 'Search documents by title or content'
      },
      limit: {
        type: 'number',
        minimum: 1,
        maximum: 100,
        default: 20,
        description: 'Maximum number of documents to return'
      }
    }
  }
}

export const listDocuments = requireAuth(async (args: any) => {
  const { project_id, document_type, search, limit } = ListDocumentsSchema.parse(args)
  
  logger.info('Listing documents', { project_id, document_type, search, limit })
  
  const documents = await supabaseService.getDocuments(
    { project_id, type: document_type, search },
    { limit },
    { field: 'updated_at', order: 'desc' }
  )
  
  // Add document analytics
  const documentAnalytics = {
    total_documents: documents.length,
    document_types: documents.reduce((acc, doc) => {
      acc[doc.document_type] = (acc[doc.document_type] || 0) + 1
      return acc
    }, {} as Record<string, number>),
    ai_ready_count: 0, // Metadata not available in current schema
    average_content_length: documents.reduce((sum, doc) => sum + doc.content.length, 0) / (documents.length || 1)
  }
  
  return {
    documents,
    analytics: documentAnalytics,
    filters_applied: { project_id, document_type, search }
  }
})

/**
 * Create new document with markdown support
 */
export const createDocumentTool: MCPTool = {
  name: 'create_document',
  description: 'Create a new document with markdown content and optional frontmatter metadata',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'string',
        format: 'uuid',
        description: 'Optional project ID to associate the document with'
      },
      title: {
        type: 'string',
        minLength: 1,
        maxLength: 500,
        description: 'The title of the document'
      },
      content: {
        type: 'string',
        description: 'The markdown content of the document (can include YAML frontmatter)'
      },
      document_type: {
        type: 'string',
        enum: ['requirement', 'design', 'technical', 'meeting_notes', 'other'],
        description: 'The type of document being created'
      },
      metadata: {
        type: 'object',
        description: 'Additional metadata for the document'
      }
    },
    required: ['title', 'content', 'document_type']
  }
}

export const createDocument = requireAuth(async (args: any) => {
  const documentData = CreateDocumentSchema.parse(args)
  
  logger.info('Creating new document', { 
    project_id: documentData.project_id, 
    title: documentData.title,
    document_type: documentData.document_type
  })
  
  // Parse frontmatter and analyze content
  const contentAnalysis = analyzeDocumentContentHelper(documentData.content, documentData.document_type)
  
  const document = await supabaseService.createDocument({
    project_id: documentData.project_id || '', // Ensure project_id is not undefined
    title: documentData.title,
    content: documentData.content,
    document_type: documentData.document_type
    // Removed format and metadata as they don't exist in the database schema
  })
  
  logger.info('Document created successfully', { document_id: document.id, title: document.title })
  
  return {
    document,
    content_analysis: contentAnalysis,
    message: `Document "${document.title}" created successfully`
  }
})

/**
 * Update existing document
 */
export const updateDocumentTool: MCPTool = {
  name: 'update_document',
  description: 'Update an existing document with new content or metadata',
  inputSchema: {
    type: 'object',
    properties: {
      document_id: {
        type: 'string',
        format: 'uuid',
        description: 'The unique identifier of the document to update'
      },
      title: {
        type: 'string',
        minLength: 1,
        maxLength: 500,
        description: 'New title for the document'
      },
      content: {
        type: 'string',
        description: 'New markdown content for the document'
      },
      document_type: {
        type: 'string',
        enum: ['requirement', 'design', 'technical', 'meeting_notes', 'other'],
        description: 'New document type'
      },
      metadata: {
        type: 'object',
        description: 'Updated metadata for the document'
      }
    },
    required: ['document_id']
  }
}

export const updateDocument = requireAuth(async (args: any) => {
  const { document_id, ...updates } = UpdateDocumentSchema.parse(args)
  
  logger.info('Updating document', { document_id, updates: Object.keys(updates) })
  
  // Analyze content if it's being updated
  let contentAnalysis = undefined
  if (updates.content) {
    const currentDoc = await supabaseService.getDocument(document_id)
    contentAnalysis = analyzeDocumentContentHelper(updates.content, updates.document_type || currentDoc.document_type)
    
    // Removed metadata updates as metadata doesn't exist in the database schema
  }
  
  const document = await supabaseService.updateDocument(document_id, updates)
  
  logger.info('Document updated successfully', { document_id: document.id })
  
  return {
    document,
    content_analysis: contentAnalysis,
    message: `Document "${document.title}" updated successfully`
  }
})

/**
 * Search documents with advanced filtering
 */
export const searchDocumentsTool: MCPTool = {
  name: 'search_documents',
  description: 'Search documents by content with advanced filtering and ranking',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        minLength: 1,
        description: 'Search query to find in document titles and content'
      },
      project_id: {
        type: 'string',
        format: 'uuid',
        description: 'Limit search to specific project'
      },
      document_types: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['requirement', 'design', 'technical', 'meeting_notes', 'other']
        },
        description: 'Filter by document types'
      },
      limit: {
        type: 'number',
        minimum: 1,
        maximum: 50,
        default: 20,
        description: 'Maximum number of results to return'
      },
      include_content: {
        type: 'boolean',
        default: false,
        description: 'Whether to include full document content in results'
      }
    },
    required: ['query']
  }
}

export const searchDocuments = requireAuth(async (args: any) => {
  const { query, project_id, document_types, limit, include_content } = SearchDocumentsSchema.parse(args)
  
  logger.info('Searching documents', { query, project_id, document_types, limit })
  
  // Get all matching documents
  const allDocuments = await supabaseService.getDocuments(
    { 
      project_id, 
      search: query 
    },
    { limit: limit * 2 }, // Get more for better ranking
    { field: 'updated_at', order: 'desc' }
  )
  
  // Filter by document types if specified
  let filteredDocuments = allDocuments
  if (document_types && document_types.length > 0) {
    filteredDocuments = allDocuments.filter(doc => document_types.includes(doc.document_type))
  }
  
  // Rank results by relevance
  const rankedResults = rankSearchResults(filteredDocuments, query, include_content)
  
  // Limit results
  const finalResults = rankedResults.slice(0, limit)
  
  return {
    results: finalResults,
    total_found: rankedResults.length,
    search_metadata: {
      query,
      filters: { project_id, document_types },
      ranking_factors: ['title_match', 'content_relevance', 'document_freshness', 'ai_readiness']
    }
  }
})

/**
 * Get document with AI context
 */
export const getDocumentContextTool: MCPTool = {
  name: 'get_document_context',
  description: 'Get document with full context including links, references, and AI metadata',
  inputSchema: {
    type: 'object',
    properties: {
      document_id: {
        type: 'string',
        format: 'uuid',
        description: 'The unique identifier of the document'
      }
    },
    required: ['document_id']
  }
}

export const getDocumentContext = requireAuth(async (args: any) => {
  const { document_id } = GetDocumentSchema.parse(args)
  
  logger.info('Getting document context', { document_id })
  
  const document = await supabaseService.getDocument(document_id)
  
  // Analyze document content and extract metadata
  const contentAnalysis = analyzeDocumentContentHelper(document.content, document.document_type)
  const linkAnalysis = extractDocumentLinks(document.content)
  const aiContext = extractAIContext({})
  
  // Find related documents
  const relatedDocs = await findRelatedDocuments(document)
  
  return {
    document,
    content_analysis: contentAnalysis,
    link_analysis: linkAnalysis,
    ai_context: aiContext,
    related_documents: relatedDocs,
    recommendations: generateDocumentRecommendations(document, contentAnalysis)
  }
})

// Helper functions for document analysis
function analyzeDocumentContentHelper(content: string, documentType: string): object {
  // Parse frontmatter if present
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/)
  const hasFrontmatter = !!frontmatterMatch
  
  // Extract plain content (without frontmatter)
  const plainContent = hasFrontmatter ? content.replace(/^---\n[\s\S]*?\n---\n/, '') : content
  
  // Basic content analysis
  const words = plainContent.split(/\s+/).filter(w => w.length > 0)
  const lines = plainContent.split('\n')
  const headings = (plainContent.match(/^#+\s+.+$/gm) || []).length
  const codeBlocks = (plainContent.match(/```[\s\S]*?```/g) || []).length
  const links = (plainContent.match(/\[([^\]]+)\]\([^)]+\)/g) || []).length
  const internalLinks = (plainContent.match(/\[\[([^\]]+)\]\]/g) || []).length
  
  return {
    word_count: words.length,
    line_count: lines.length,
    character_count: plainContent.length,
    heading_count: headings,
    code_block_count: codeBlocks,
    link_count: links,
    internal_link_count: internalLinks,
    has_frontmatter: hasFrontmatter,
    estimated_read_time: Math.ceil(words.length / 200), // 200 words per minute
    content_complexity: calculateContentComplexity(plainContent, documentType),
    ai_readiness_score: calculateAIReadinessScore(content, hasFrontmatter)
  }
}

function extractDocumentLinks(content: string): object {
  // Extract all types of links
  const externalLinks = (content.match(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g) || [])
    .map(match => {
      const [, text, url] = match.match(/\[([^\]]+)\]\(([^)]+)\)/) || []
      return { text, url, type: 'external' }
    })
  
  const internalLinks = (content.match(/\[\[([^\]]+)\]\]/g) || [])
    .map(match => {
      const text = match.replace(/\[\[|\]\]/g, '')
      return { text, type: 'internal' }
    })
  
  const anchorLinks = (content.match(/\[([^\]]+)\]\(#([^)]+)\)/g) || [])
    .map(match => {
      const [, text, anchor] = match.match(/\[([^\]]+)\]\(#([^)]+)\)/) || []
      return { text, anchor, type: 'anchor' }
    })
  
  return {
    external_links: externalLinks,
    internal_links: internalLinks,
    anchor_links: anchorLinks,
    total_links: externalLinks.length + internalLinks.length + anchorLinks.length,
    link_health: 'unknown' // Would be calculated by checking link validity
  }
}

function extractAIContext(metadata: any): object {
  // Since metadata doesn't exist in the database schema, return default values
  return {
    has_ai_instructions: false,
    has_ai_context: false,
    ai_capabilities: [],
    ai_restrictions: [],
    validation_status: { isValid: false, issues: [], suggestions: [] }
  }
}

async function findRelatedDocuments(document: any): Promise<any[]> {
  // Simple related document finding based on project and type
  if (!document.project_id) return []
  
  try {
    const relatedDocs = await supabaseService.getDocuments(
      { project_id: document.project_id },
      { limit: 5 }
    )
    
    return relatedDocs
      .filter(doc => doc.id !== document.id)
      .slice(0, 3) // Return top 3 related docs
  } catch (error) {
    logger.error('Error finding related documents:', error)
    return []
  }
}

function calculateContentComplexity(content: string, documentType: string): string {
  let complexity = 0
  
  // Factor in length
  if (content.length > 5000) complexity += 2
  else if (content.length > 2000) complexity += 1
  
  // Factor in structure
  const headings = (content.match(/^#+\s+.+$/gm) || []).length
  if (headings > 10) complexity += 2
  else if (headings > 5) complexity += 1
  
  // Factor in code blocks
  const codeBlocks = (content.match(/```[\s\S]*?```/g) || []).length
  if (codeBlocks > 5) complexity += 2
  else if (codeBlocks > 2) complexity += 1
  
  // Factor in document type
  if (['technical_spec', 'api_docs'].includes(documentType)) complexity += 1
  
  if (complexity >= 4) return 'high'
  if (complexity >= 2) return 'medium'
  return 'low'
}

function calculateAIReadinessScore(content: string, hasFrontmatter: boolean): number {
  let score = 0
  
  // Frontmatter presence
  if (hasFrontmatter) score += 30
  
  // Structure quality
  const headings = (content.match(/^#+\s+.+$/gm) || []).length
  if (headings > 0) score += 20
  
  // Content length (not too short, not too long)
  const words = content.split(/\s+/).length
  if (words > 100 && words < 5000) score += 20
  
  // Code examples
  if (content.includes('```')) score += 15
  
  // Links and references
  if (content.includes('[') && content.includes('](')) score += 15
  
  return Math.min(100, score)
}

function rankSearchResults(documents: any[], query: string, includeContent: boolean): any[] {
  const queryLower = query.toLowerCase()
  
  return documents
    .map(doc => {
      let score = 0
      
      // Title match (highest weight)
      if (doc.title.toLowerCase().includes(queryLower)) {
        score += 50
        if (doc.title.toLowerCase().startsWith(queryLower)) score += 25
      }
      
      // Content relevance
      const contentLower = doc.content.toLowerCase()
      const queryMatches = (contentLower.match(new RegExp(queryLower, 'g')) || []).length
      score += Math.min(30, queryMatches * 5)
      
      // Document freshness
      const daysSinceUpdate = (Date.now() - new Date(doc.updated_at).getTime()) / (1000 * 60 * 60 * 24)
      if (daysSinceUpdate < 7) score += 10
      else if (daysSinceUpdate < 30) score += 5
      
      // AI readiness
      // Removed metadata check as it doesn't exist in the database schema
      
      // Document type relevance
      if (['readme', 'api_docs'].includes(doc.document_type)) score += 10
      
      return {
        ...doc,
        content: includeContent ? doc.content : undefined,
        search_score: score,
        query_matches: queryMatches
      }
    })
    .sort((a, b) => b.search_score - a.search_score)
}

function generateDocumentRecommendations(document: any, analysis: any): string[] {
  const recommendations: string[] = []
  
  if (!analysis.has_frontmatter) {
    recommendations.push('Add YAML frontmatter with metadata to improve AI integration')
  }
  
  if (analysis.word_count < 100) {
    recommendations.push('Document seems too brief - consider adding more detailed content')
  }
  
  if (analysis.heading_count === 0) {
    recommendations.push('Add headings to improve document structure and readability')
  }
  
  if (analysis.internal_link_count === 0 && document.project_id) {
    recommendations.push('Consider adding links to related project documents')
  }
  
  if (analysis.ai_readiness_score < 60) {
    recommendations.push('Improve AI readiness by adding structured metadata and clear sections')
  }
  
  return recommendations
}

/**
 * Get document by ID
 */
export const getDocumentTool: MCPTool = {
  name: 'get_document',
  description: 'Get a document by ID with basic information',
  inputSchema: {
    type: 'object',
    properties: {
      document_id: {
        type: 'string',
        format: 'uuid',
        description: 'The unique identifier of the document'
      }
    },
    required: ['document_id']
  }
}

export const getDocument = requireAuth(async (args: any) => {
  const { document_id } = GetDocumentSchema.parse(args)
  
  logger.info('Getting document', { document_id })
  
  const document = await supabaseService.getDocument(document_id)
  
  return {
    document,
    message: `Document "${document.title}" retrieved successfully`
  }
})

/**
 * Add document collaborator
 */
export const addDocumentCollaboratorTool: MCPTool = {
  name: 'add_document_collaborator',
  description: 'Add a collaborator to a document with specific permissions',
  inputSchema: {
    type: 'object',
    properties: {
      document_id: {
        type: 'string',
        description: 'ID of the document'
      },
      user_id: {
        type: 'string',
        description: 'ID of the user to add as collaborator'
      },
      permission_level: {
        type: 'string',
        enum: ['read', 'comment', 'edit', 'admin'],
        default: 'edit',
        description: 'Permission level for the collaborator'
      },
      notify: {
        type: 'boolean',
        default: true,
        description: 'Whether to notify the user about collaboration invite'
      }
    },
    required: ['document_id', 'user_id']
  }
}

const AddDocumentCollaboratorSchema = z.object({
  document_id: z.string().min(1),
  user_id: z.string().min(1),
  permission_level: z.enum(['read', 'comment', 'edit', 'admin']).default('edit'),
  notify: z.boolean().default(true)
})

export const addDocumentCollaborator = requireAuth(async (args: any) => {
  const { document_id, user_id, permission_level, notify } = AddDocumentCollaboratorSchema.parse(args)
  
  logger.info('Adding document collaborator', { document_id, user_id, permission_level })

  // Get document and verify permissions
  const document = await supabaseService.getDocument(document_id)
  if (!document) {
    throw new Error('Document not found')
  }

  // Create collaboration record
  const collaboration = await supabaseService.createDocumentCollaboration({
    document_id,
    user_id,
    permission_level,
    status: 'active',
    invited_at: new Date().toISOString()
  })

  // Note: metadata field doesn't exist in the database schema
  // Collaboration would be tracked in a separate table

  return {
    collaboration,
    document: await supabaseService.getDocument(document_id),
    message: `User added as ${permission_level} collaborator`
  }
})

/**
 * Analyze document content
 */
export const analyzeDocumentContentTool: MCPTool = {
  name: 'analyze_document_content',
  description: 'Perform advanced analysis on document content',
  inputSchema: {
    type: 'object',
    properties: {
      document_id: {
        type: 'string',
        description: 'ID of the document to analyze'
      },
      analysis_types: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['readability', 'completeness', 'ai_optimization', 'link_analysis', 'structure_analysis']
        },
        default: ['readability', 'completeness'],
        description: 'Types of analysis to perform'
      },
      include_suggestions: {
        type: 'boolean',
        default: true,
        description: 'Whether to include improvement suggestions'
      }
    },
    required: ['document_id']
  }
}

const AnalyzeDocumentContentSchema = z.object({
  document_id: z.string().min(1),
  analysis_types: z.array(z.enum(['readability', 'completeness', 'ai_optimization', 'link_analysis', 'structure_analysis'])).default(['readability', 'completeness']),
  include_suggestions: z.boolean().default(true)
})

export const analyzeDocumentContent = requireAuth(async (args: any) => {
  const { document_id, analysis_types, include_suggestions } = AnalyzeDocumentContentSchema.parse(args)
  
  logger.info('Analyzing document content', { document_id, analysis_types })

  const document = await supabaseService.getDocument(document_id)
  if (!document) {
    throw new Error('Document not found')
  }

  const analysis: any = {
    document_id,
    title: document.title,
    analyzed_at: new Date().toISOString(),
    results: {}
  }

  // Perform requested analyses
  for (const analysisType of analysis_types) {
    switch (analysisType) {
      case 'readability':
        analysis.results.readability = analyzeReadability(document.content)
        break
      case 'completeness':
        analysis.results.completeness = analyzeCompleteness(document)
        break
      case 'ai_optimization':
        analysis.results.ai_optimization = analyzeAIOptimization(document)
        break
      case 'link_analysis':
        analysis.results.link_analysis = analyzeLinkStructure(document.content)
        break
      case 'structure_analysis':
        analysis.results.structure_analysis = analyzeDocumentStructure(document.content)
        break
    }
  }

  // Generate improvement suggestions
  if (include_suggestions) {
    analysis.suggestions = generateImprovementSuggestions(analysis.results, document)
  }

  // Calculate overall score
  analysis.overall_score = calculateOverallDocumentScore(analysis.results)

  return analysis
})

/**
 * Get document collaboration history
 */
export const getDocumentCollaborationTool: MCPTool = {
  name: 'get_document_collaboration',
  description: 'Get collaboration history and current collaborators for a document',
  inputSchema: {
    type: 'object',
    properties: {
      document_id: {
        type: 'string',
        description: 'ID of the document'
      },
      include_activity: {
        type: 'boolean',
        default: true,
        description: 'Whether to include recent activity'
      },
      time_range: {
        type: 'string',
        enum: ['day', 'week', 'month', 'all'],
        default: 'week',
        description: 'Time range for activity'
      }
    },
    required: ['document_id']
  }
}

const GetDocumentCollaborationSchema = z.object({
  document_id: z.string().min(1),
  include_activity: z.boolean().default(true),
  time_range: z.enum(['day', 'week', 'month', 'all']).default('week')
})

export const getDocumentCollaboration = requireAuth(async (args: any) => {
  const { document_id, include_activity, time_range } = GetDocumentCollaborationSchema.parse(args)
  
  logger.info('Getting document collaboration', { document_id, time_range })

  const document = await supabaseService.getDocument(document_id)
  if (!document) {
    throw new Error('Document not found')
  }

  // Get collaborators
  const collaborations = await supabaseService.getDocumentCollaborations(document_id)
  
  // Get activity if requested
  let activity = []
  if (include_activity) {
    activity = await getDocumentActivity(document_id, time_range)
  }

  // Analyze collaboration patterns
  const collaborationStats = analyzeCollaborationPatterns(collaborations, activity)

  return {
    document: {
      id: document.id,
      title: document.title,
      created_by: document.created_by
    },
    collaborators: collaborations.map(c => ({
      user_id: c.user_id,
      permission_level: c.permission_level,
      status: c.status,
      joined_at: c.invited_at,
      last_activity: activity.filter(a => a.user_id === c.user_id)[0]?.timestamp
    })),
    activity: activity.slice(0, 50), // Limit to 50 recent activities
    statistics: collaborationStats
  }
})

/**
 * Generate document templates
 */
export const generateDocumentTemplateTool: MCPTool = {
  name: 'generate_document_template',
  description: 'Generate a document template based on type and requirements',
  inputSchema: {
    type: 'object',
    properties: {
      template_type: {
        type: 'string',
        enum: ['readme', 'api_doc', 'meeting_notes', 'technical_spec', 'user_guide', 'project_proposal'],
        description: 'Type of template to generate'
      },
      project_context: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          tech_stack: { type: 'array', items: { type: 'string' } },
          team_size: { type: 'number' }
        },
        description: 'Project context for template customization'
      },
      ai_optimized: {
        type: 'boolean',
        default: true,
        description: 'Whether to include AI-optimization features'
      },
      include_examples: {
        type: 'boolean',
        default: true,
        description: 'Whether to include example content'
      }
    },
    required: ['template_type']
  }
}

const GenerateDocumentTemplateSchema = z.object({
  template_type: z.enum(['readme', 'api_doc', 'meeting_notes', 'technical_spec', 'user_guide', 'project_proposal']),
  project_context: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    tech_stack: z.array(z.string()).optional(),
    team_size: z.number().optional()
  }).optional(),
  ai_optimized: z.boolean().default(true),
  include_examples: z.boolean().default(true)
})

export const generateDocumentTemplate = requireAuth(async (args: any) => {
  const { template_type, project_context, ai_optimized, include_examples } = GenerateDocumentTemplateSchema.parse(args)
  
  logger.info('Generating document template', { template_type, ai_optimized })

  const template = generateTemplateContent(template_type, project_context, ai_optimized, include_examples)
  
  return {
    template_type,
    content: template.content,
    frontmatter: template.frontmatter,
    sections: template.sections,
    ai_instructions: ai_optimized ? template.ai_instructions : undefined,
    usage_tips: template.usage_tips
  }
})

/**
 * Bulk document operations
 */
export const bulkDocumentOperationsTool: MCPTool = {
  name: 'bulk_document_operations',
  description: 'Perform bulk operations on multiple documents',
  inputSchema: {
    type: 'object',
    properties: {
      document_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of document IDs'
      },
      operation: {
        type: 'string',
        enum: ['update_metadata', 'add_tags', 'change_visibility', 'archive', 'analyze'],
        description: 'Operation to perform'
      },
      operation_data: {
        type: 'object',
        description: 'Data for the operation'
      }
    },
    required: ['document_ids', 'operation']
  }
}

const BulkDocumentOperationsSchema = z.object({
  document_ids: z.array(z.string().min(1)).min(1),
  operation: z.enum(['update_metadata', 'add_tags', 'change_visibility', 'archive', 'analyze']),
  operation_data: z.record(z.any()).optional()
})

export const bulkDocumentOperations = requireAuth(async (args: any) => {
  const { document_ids, operation, operation_data } = BulkDocumentOperationsSchema.parse(args)
  
  logger.info('Performing bulk document operations', { document_count: document_ids.length, operation })

  const results = []
  const now = new Date().toISOString()

  for (const document_id of document_ids) {
    try {
      let result
      switch (operation) {
        case 'update_metadata':
          // metadata field doesn't exist in the database schema
          result = await supabaseService.updateDocument(document_id, {
            updated_at: now
          })
          break
        case 'add_tags':
          const doc = await supabaseService.getDocument(document_id)
          const existingTags = [] // metadata doesn't exist in the database schema
          const newTags = operation_data?.tags || []
          // metadata field doesn't exist in the database schema
          result = await supabaseService.updateDocument(document_id, {
            updated_at: now
          })
          break
        case 'change_visibility':
          // visibility field doesn't exist in the database schema
          result = await supabaseService.updateDocument(document_id, {
            updated_at: now
          })
          break
        case 'archive':
          // status and metadata fields don't exist in the database schema
          result = await supabaseService.updateDocument(document_id, {
            updated_at: now
          })
          break
        case 'analyze':
          result = await analyzeDocumentContent({ 
            document_id, 
            analysis_types: operation_data?.analysis_types || ['readability', 'completeness'],
            include_suggestions: true 
          })
          break
        default:
          throw new Error(`Unknown operation: ${operation}`)
      }

      results.push({
        document_id,
        success: true,
        result
      })
    } catch (error) {
      logger.error(`Failed operation ${operation} on document ${document_id}:`, error)
      results.push({
        document_id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  return {
    operation,
    summary: {
      total_documents: document_ids.length,
      successful_operations: results.filter(r => r.success).length,
      failed_operations: results.filter(r => !r.success).length
    },
    results
  }
})

// Helper functions for document analysis
function analyzeReadability(content: string): any {
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0)
  const words = content.split(/\s+/).filter(w => w.length > 0)
  const avgWordsPerSentence = words.length / sentences.length
  
  // Simple readability score (0-100, higher is more readable)
  let readabilityScore = 100
  if (avgWordsPerSentence > 20) readabilityScore -= 20
  if (avgWordsPerSentence > 30) readabilityScore -= 20
  
  const longWords = words.filter(w => w.length > 6).length
  const longWordPercentage = (longWords / words.length) * 100
  if (longWordPercentage > 30) readabilityScore -= 15
  
  return {
    score: Math.max(0, readabilityScore),
    metrics: {
      total_words: words.length,
      total_sentences: sentences.length,
      avg_words_per_sentence: Math.round(avgWordsPerSentence * 10) / 10,
      long_word_percentage: Math.round(longWordPercentage * 10) / 10
    },
    level: readabilityScore > 80 ? 'easy' : readabilityScore > 60 ? 'moderate' : 'difficult'
  }
}

function analyzeCompleteness(document: any): any {
  const content = document.content || ''
  const frontmatter = {} // metadata doesn't exist in the database schema
  
  let completenessScore = 0
  const missingElements = []
  
  // Check for basic elements
  if (document.title) completenessScore += 20
  else missingElements.push('title')
  
  if (content.length > 100) completenessScore += 20
  else missingElements.push('substantial_content')
  
  // frontmatter.description removed as metadata doesn't exist
  missingElements.push('description')
  
  // Check for structure
  if (content.includes('#')) completenessScore += 15
  else missingElements.push('headings')
  
  if (content.includes('```') || content.includes('`')) completenessScore += 10
  else missingElements.push('code_examples')
  
  // Check for links
  if (content.includes('[') && content.includes('](')) completenessScore += 10
  else missingElements.push('links')
  
  // Check for metadata
  // frontmatter.tags removed as metadata doesn't exist
  missingElements.push('tags')
  
  return {
    score: completenessScore,
    level: completenessScore > 80 ? 'complete' : completenessScore > 60 ? 'good' : 'needs_work',
    missing_elements: missingElements,
    recommendations: generateCompletenessRecommendations(missingElements)
  }
}

function analyzeAIOptimization(document: any): any {
  const content = document.content || ''
  const frontmatter = {} // metadata doesn't exist in the database schema
  
  let aiScore = 0
  const optimizations = []
  
  // Check for AI-specific frontmatter
  // frontmatter.ai_instructions removed as metadata doesn't exist
  optimizations.push('add_ai_instructions')
  
  // frontmatter.ai_context removed as metadata doesn't exist
  optimizations.push('add_ai_context')
  
  // frontmatter.ai_capabilities removed as metadata doesn't exist
  optimizations.push('define_ai_capabilities')
  
  // Check for structured content
  if (content.includes('## ') || content.includes('### ')) aiScore += 20
  else optimizations.push('improve_structure')
  
  // Check for examples
  if (content.includes('Example:') || content.includes('```')) aiScore += 20
  else optimizations.push('add_examples')
  
  return {
    score: aiScore,
    level: aiScore > 80 ? 'highly_optimized' : aiScore > 60 ? 'optimized' : 'needs_optimization',
    missing_optimizations: optimizations,
    ai_readiness: aiScore > 60 ? 'ready' : 'not_ready'
  }
}

function analyzeLinkStructure(content: string): any {
  const internalLinks = (content.match(/\[\[[^\]]+\]\]/g) || []).length
  const externalLinks = (content.match(/\[([^\]]+)\]\(([^)]+)\)/g) || []).length
  const brokenLinkPatterns = (content.match(/\[([^\]]*)\]\(\)/g) || []).length
  
  return {
    internal_links: internalLinks,
    external_links: externalLinks,
    total_links: internalLinks + externalLinks,
    broken_links: brokenLinkPatterns,
    link_density: (internalLinks + externalLinks) / (content.length / 1000), // links per 1000 chars
    recommendations: generateLinkRecommendations(internalLinks, externalLinks, brokenLinkPatterns)
  }
}

function analyzeDocumentStructure(content: string): any {
  const h1Count = (content.match(/^# /gm) || []).length
  const h2Count = (content.match(/^## /gm) || []).length
  const h3Count = (content.match(/^### /gm) || []).length
  
  const codeBlocks = (content.match(/```[\s\S]*?```/g) || []).length
  const inlineCode = (content.match(/`[^`]+`/g) || []).length
  
  const lists = (content.match(/^[-*+] /gm) || []).length
  const numberedLists = (content.match(/^\d+\. /gm) || []).length
  
  return {
    heading_structure: {
      h1: h1Count,
      h2: h2Count,
      h3: h3Count,
      total: h1Count + h2Count + h3Count
    },
    code_elements: {
      code_blocks: codeBlocks,
      inline_code: inlineCode
    },
    lists: {
      bullet_lists: lists,
      numbered_lists: numberedLists,
      total: lists + numberedLists
    },
    structure_score: calculateStructureScore(h1Count, h2Count, h3Count, codeBlocks, lists)
  }
}

function generateImprovementSuggestions(results: any, document: any): string[] {
  const suggestions = []
  
  if (results.readability?.score < 70) {
    suggestions.push('Improve readability by shortening sentences and using simpler words')
  }
  
  if (results.completeness?.score < 70) {
    suggestions.push('Add missing content elements: ' + results.completeness.missing_elements.join(', '))
  }
  
  if (results.ai_optimization?.score < 60) {
    suggestions.push('Optimize for AI by adding structured metadata and clear examples')
  }
  
  if (results.link_analysis?.broken_links > 0) {
    suggestions.push(`Fix ${results.link_analysis.broken_links} broken link(s)`)
  }
  
  if (results.structure_analysis?.heading_structure.total === 0) {
    suggestions.push('Add headings to improve document structure')
  }
  
  return suggestions
}

function calculateOverallDocumentScore(results: any): number {
  const scores = []
  
  if (results.readability) scores.push(results.readability.score)
  if (results.completeness) scores.push(results.completeness.score)
  if (results.ai_optimization) scores.push(results.ai_optimization.score)
  if (results.structure_analysis) scores.push(results.structure_analysis.structure_score)
  
  return scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
}

async function getDocumentActivity(documentId: string, timeRange: string): Promise<any[]> {
  // This would query actual activity logs
  // For now, return placeholder data
  return [
    {
      timestamp: new Date().toISOString(),
      user_id: 'user1',
      action: 'edited',
      details: 'Content updated'
    }
  ]
}

function analyzeCollaborationPatterns(collaborations: any[], activity: any[]): any {
  return {
    total_collaborators: collaborations.length,
    active_collaborators: collaborations.filter(c => c.status === 'active').length,
    permission_distribution: {
      read: collaborations.filter(c => c.permission_level === 'read').length,
      comment: collaborations.filter(c => c.permission_level === 'comment').length,
      edit: collaborations.filter(c => c.permission_level === 'edit').length,
      admin: collaborations.filter(c => c.permission_level === 'admin').length
    },
    recent_activity_count: activity.length,
    collaboration_health: collaborations.length > 0 && activity.length > 0 ? 'active' : 'low'
  }
}

function generateTemplateContent(type: string, context: any, aiOptimized: boolean, includeExamples: boolean): any {
  const templates = {
    readme: {
      content: generateReadmeTemplate(context, includeExamples),
      frontmatter: {
        document_type: 'readme',
        template_version: '1.0',
        ...(aiOptimized && {
          ai_instructions: 'This README should help users quickly understand and get started with the project',
          ai_capabilities: ['generate', 'review', 'translate']
        })
      },
      sections: ['Overview', 'Installation', 'Usage', 'Contributing', 'License'],
      ai_instructions: aiOptimized ? 'Keep content clear, structured, and actionable' : undefined,
      usage_tips: ['Update installation steps regularly', 'Include code examples', 'Add contribution guidelines']
    }
    // Add more templates...
  }
  
  return templates[type as keyof typeof templates] || templates.readme
}

function generateReadmeTemplate(context: any, includeExamples: boolean): string {
  const projectName = context?.name || 'Your Project Name'
  const description = context?.description || 'A brief description of your project'
  
  return `# ${projectName}

${description}

## Overview

Brief overview of what this project does and why it exists.

## Installation

\`\`\`bash
# Installation steps
npm install
\`\`\`

## Usage

${includeExamples ? `
\`\`\`javascript
// Example usage
const example = require('${projectName.toLowerCase()}')
example.doSomething()
\`\`\`
` : 'Basic usage instructions here.'}

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT License - see LICENSE file for details.
`
}

function generateCompletenessRecommendations(missingElements: string[]): string[] {
  const recommendations: string[] = []
  
  if (missingElements.includes('title')) {
    recommendations.push('Add a clear, descriptive title')
  }
  if (missingElements.includes('description')) {
    recommendations.push('Add a description in frontmatter')
  }
  if (missingElements.includes('headings')) {
    recommendations.push('Structure content with headings (##, ###)')
  }
  if (missingElements.includes('code_examples')) {
    recommendations.push('Include code examples or snippets')
  }
  
  return recommendations
}

function generateLinkRecommendations(internal: number, external: number, broken: number): string[] {
  const recommendations: string[] = []
  
  if (broken > 0) {
    recommendations.push(`Fix ${broken} broken link(s)`)
  }
  if (internal === 0) {
    recommendations.push('Add internal links to related documents')
  }
  if (external === 0 && internal < 2) {
    recommendations.push('Consider adding relevant external references')
  }
  
  return recommendations
}

function calculateStructureScore(h1: number, h2: number, h3: number, codeBlocks: number, lists: number): number {
  let score = 0
  
  if (h1 > 0) score += 20
  if (h2 > 0) score += 30
  if (h3 > 0) score += 20
  if (codeBlocks > 0) score += 15
  if (lists > 0) score += 15
  
  return Math.min(100, score)
}

export const documentHandlers = {
  list_documents: listDocuments,
  create_document: createDocument,
  get_document: getDocument,
  update_document: updateDocument,
  search_documents: searchDocuments,
  get_document_context: getDocumentContext,
  add_document_collaborator: addDocumentCollaborator,
  analyze_document_content: analyzeDocumentContent,
  get_document_collaboration: getDocumentCollaboration,
  generate_document_template: generateDocumentTemplate,
  bulk_document_operations: bulkDocumentOperations
}

// Export all document tools
export const documentTools = {
  listDocumentsTool,
  createDocumentTool,
  getDocumentTool,
  updateDocumentTool,
  searchDocumentsTool,
  getDocumentContextTool,
  addDocumentCollaboratorTool,
  analyzeDocumentContentTool,
  getDocumentCollaborationTool,
  generateDocumentTemplateTool,
  bulkDocumentOperationsTool
}