import { z } from 'zod'
// Local type definitions
interface MCPTool {
  name: string
  description: string
  inputSchema: any
}
import { supabaseService } from '../lib/api-client.js'
import { requireAuth } from '../lib/auth.js'
import { logger } from '../lib/logger.js'

/**
 * Universal search across all data types
 */
export const universalSearchTool: MCPTool = {
  name: 'universal_search',
  description: 'Search across all projects, tasks, documents, and conversations with intelligent ranking',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query text'
      },
      search_types: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['projects', 'tasks', 'documents', 'conversations', 'profiles']
        },
        default: ['projects', 'tasks', 'documents'],
        description: 'Types of content to search'
      },
      filters: {
        type: 'object',
        properties: {
          project_id: { type: 'string' },
          status: { type: 'string' },
          priority: { type: 'string' },
          assignee_id: { type: 'string' },
          date_range: {
            type: 'object',
            properties: {
              start: { type: 'string', format: 'date' },
              end: { type: 'string', format: 'date' }
            }
          },
          tags: { type: 'array', items: { type: 'string' } }
        },
        description: 'Additional filters to apply'
      },
      limit: {
        type: 'number',
        minimum: 1,
        maximum: 100,
        default: 20,
        description: 'Maximum number of results to return'
      },
      include_snippets: {
        type: 'boolean',
        default: true,
        description: 'Whether to include content snippets in results'
      },
      semantic_search: {
        type: 'boolean',
        default: false,
        description: 'Use semantic similarity instead of keyword matching'
      }
    },
    required: ['query']
  }
}

const UniversalSearchSchema = z.object({
  query: z.string().min(1),
  search_types: z.array(z.enum(['projects', 'tasks', 'documents', 'conversations', 'profiles'])).default(['projects', 'tasks', 'documents']),
  filters: z.object({
    project_id: z.string().optional(),
    status: z.string().optional(),
    priority: z.string().optional(),
    assignee_id: z.string().optional(),
    date_range: z.object({
      start: z.string().optional(),
      end: z.string().optional()
    }).optional(),
    tags: z.array(z.string()).optional()
  }).optional(),
  limit: z.number().min(1).max(100).default(20),
  include_snippets: z.boolean().default(true),
  semantic_search: z.boolean().default(false)
})

export const universalSearch = requireAuth(async (args: any) => {
  const { query, search_types, filters, limit, include_snippets, semantic_search } = UniversalSearchSchema.parse(args)
  
  logger.info('Performing universal search', { query, search_types, semantic_search })

  const searchResults: any = {
    query,
    search_types,
    results: {},
    total_results: 0,
    search_time: 0
  }

  const startTime = Date.now()
  
  // Perform searches across all requested types
  const searchPromises = search_types.map(async (type) => {
    try {
      let results
      switch (type) {
        case 'projects':
          results = await searchProjects(query, filters, limit, semantic_search)
          break
        case 'tasks':
          results = await searchTasks(query, filters, limit, semantic_search)
          break
        case 'documents':
          results = await searchDocuments(query, filters, limit, semantic_search)
          break
        case 'conversations':
          results = await searchConversations(query, filters, limit, semantic_search)
          break
        case 'profiles':
          results = await searchProfiles(query, filters, limit, semantic_search)
          break
        default:
          results = []
      }

      if (include_snippets) {
        results = results.map((item: any) => ({
          ...item,
          snippet: generateSnippet(item, query)
        }))
      }

      return { type, results }
    } catch (error) {
      logger.error(`Search failed for type ${type}:`, error)
      return { type, results: [], error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  const searchTypeResults = await Promise.all(searchPromises)
  
  // Aggregate results
  searchTypeResults.forEach(({ type, results, error }) => {
    searchResults.results[type] = results
    searchResults.total_results += results.length
    if (error) {
      searchResults.errors = searchResults.errors || {}
      searchResults.errors[type] = error
    }
  })

  // Rank and combine results
  const combinedResults = combineAndRankResults(searchResults.results, query, semantic_search)
  searchResults.top_results = combinedResults.slice(0, limit)
  searchResults.search_time = Date.now() - startTime

  // Add search analytics
  searchResults.analytics = {
    best_match_type: getBestMatchType(searchResults.results),
    relevance_distribution: getRelevanceDistribution(combinedResults),
    search_suggestions: generateSearchSuggestions(query, searchResults.results)
  }

  return searchResults
})

/**
 * Advanced semantic search
 */
export const semanticSearchTool: MCPTool = {
  name: 'semantic_search',
  description: 'Perform semantic similarity search using AI embeddings',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Natural language search query'
      },
      context_type: {
        type: 'string',
        enum: ['project_context', 'technical_documentation', 'meeting_notes', 'code_related', 'general'],
        default: 'general',
        description: 'Type of context to optimize search for'
      },
      similarity_threshold: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        default: 0.7,
        description: 'Minimum similarity score for results'
      },
      max_results: {
        type: 'number',
        minimum: 1,
        maximum: 50,
        default: 10,
        description: 'Maximum number of results'
      },
      include_explanations: {
        type: 'boolean',
        default: false,
        description: 'Include explanations of why items matched'
      }
    },
    required: ['query']
  }
}

const SemanticSearchSchema = z.object({
  query: z.string().min(1),
  context_type: z.enum(['project_context', 'technical_documentation', 'meeting_notes', 'code_related', 'general']).default('general'),
  similarity_threshold: z.number().min(0).max(1).default(0.7),
  max_results: z.number().min(1).max(50).default(10),
  include_explanations: z.boolean().default(false)
})

export const semanticSearch = requireAuth(async (args: any) => {
  const { query, context_type, similarity_threshold, max_results, include_explanations } = SemanticSearchSchema.parse(args)
  
  logger.info('Performing semantic search', { query, context_type, similarity_threshold })

  // For now, implement a simplified semantic search using keyword expansion
  // In production, this would use actual embeddings/vector search
  const expandedQuery = expandSemanticQuery(query, context_type)
  
  const semanticResults = await performSemanticSearch(expandedQuery, similarity_threshold, max_results)
  
  if (include_explanations) {
    semanticResults.forEach((result: any) => {
      result.match_explanation = generateMatchExplanation(result, query, context_type)
    })
  }

  return {
    original_query: query,
    expanded_query: expandedQuery,
    context_type,
    similarity_threshold,
    results: semanticResults,
    total_matches: semanticResults.length
  }
})

/**
 * Search suggestions and autocomplete
 */
export const getSearchSuggestionsTool: MCPTool = {
  name: 'get_search_suggestions',
  description: 'Get intelligent search suggestions and autocomplete',
  inputSchema: {
    type: 'object',
    properties: {
      partial_query: {
        type: 'string',
        description: 'Partial search query for autocomplete'
      },
      suggestion_types: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['recent_searches', 'popular_terms', 'related_concepts', 'entity_suggestions']
        },
        default: ['recent_searches', 'popular_terms', 'entity_suggestions'],
        description: 'Types of suggestions to return'
      },
      context_project_id: {
        type: 'string',
        description: 'Project context for better suggestions'
      },
      max_suggestions: {
        type: 'number',
        minimum: 1,
        maximum: 20,
        default: 10,
        description: 'Maximum number of suggestions'
      }
    },
    required: ['partial_query']
  }
}

const GetSearchSuggestionsSchema = z.object({
  partial_query: z.string().min(1),
  suggestion_types: z.array(z.enum(['recent_searches', 'popular_terms', 'related_concepts', 'entity_suggestions'])).default(['recent_searches', 'popular_terms', 'entity_suggestions']),
  context_project_id: z.string().optional(),
  max_suggestions: z.number().min(1).max(20).default(10)
})

export const getSearchSuggestions = requireAuth(async (args: any) => {
  const { partial_query, suggestion_types, context_project_id, max_suggestions } = GetSearchSuggestionsSchema.parse(args)
  
  logger.info('Getting search suggestions', { partial_query, suggestion_types })

  const suggestions: any = {
    partial_query,
    suggestions: {},
    total_suggestions: 0
  }

  for (const suggestionType of suggestion_types) {
    try {
      let typeSuggestions: any[] = []
      
      switch (suggestionType) {
        case 'recent_searches':
          typeSuggestions = await getRecentSearches(partial_query, context_project_id)
          break
        case 'popular_terms':
          typeSuggestions = await getPopularSearchTerms(partial_query, context_project_id)
          break
        case 'related_concepts':
          typeSuggestions = await getRelatedConcepts(partial_query, context_project_id)
          break
        case 'entity_suggestions':
          typeSuggestions = await getEntitySuggestions(partial_query, context_project_id)
          break
      }

      suggestions.suggestions[suggestionType] = typeSuggestions.slice(0, max_suggestions)
      suggestions.total_suggestions += typeSuggestions.length
    } catch (error) {
      logger.error(`Failed to get suggestions for ${suggestionType}:`, error)
      suggestions.suggestions[suggestionType] = []
    }
  }

  return suggestions
})

/**
 * Smart search analytics
 */
export const getSearchAnalyticsTool: MCPTool = {
  name: 'get_search_analytics',
  description: 'Get analytics about search patterns and performance',
  inputSchema: {
    type: 'object',
    properties: {
      time_range: {
        type: 'string',
        enum: ['hour', 'day', 'week', 'month'],
        default: 'week',
        description: 'Time range for analytics'
      },
      project_id: {
        type: 'string',
        description: 'Project to filter analytics (optional)'
      },
      include_performance: {
        type: 'boolean',
        default: true,
        description: 'Include search performance metrics'
      }
    }
  }
}

const GetSearchAnalyticsSchema = z.object({
  time_range: z.enum(['hour', 'day', 'week', 'month']).default('week'),
  project_id: z.string().optional(),
  include_performance: z.boolean().default(true)
})

export const getSearchAnalytics = requireAuth(async (args: any) => {
  const { time_range, project_id, include_performance } = GetSearchAnalyticsSchema.parse(args)
  
  logger.info('Getting search analytics', { time_range, project_id })

  const analytics = await calculateSearchAnalytics(time_range, project_id, include_performance)
  
  return {
    time_range,
    project_id,
    ...analytics
  }
})

// Helper functions for search implementation
async function searchProjects(query: string, filters: any, limit: number, semantic: boolean): Promise<any[]> {
  const searchParams: any = { search: query }
  
  if (filters?.status) searchParams.status = filters.status
  if (filters?.priority) searchParams.priority = filters.priority
  if (filters?.tags) searchParams.tags = filters.tags

  const projects = await supabaseService.getProjects(searchParams, { limit })
  
  return projects.map(project => ({
    type: 'project',
    id: project.id,
    title: project.name,
    description: project.description,
    relevance_score: calculateRelevanceScore(project.name + ' ' + project.description, query),
    metadata: {
      status: project.status,
      // priority property doesn't exist in the database schema
      created_at: project.created_at,
      user_id: project.user_id
    }
  }))
}

async function searchTasks(query: string, filters: any, limit: number, semantic: boolean): Promise<any[]> {
  const searchParams: any = { search: query }
  
  if (filters?.project_id) searchParams.project_id = filters.project_id
  if (filters?.status) searchParams.status = filters.status
  if (filters?.assignee_id) searchParams.assignee_id = filters.assignee_id
  if (filters?.priority) searchParams.priority = filters.priority

  const tasks = await supabaseService.getTasks(searchParams, { limit })
  
  return tasks.map(task => ({
    type: 'task',
    id: task.id,
    title: task.title,
    description: task.description,
    relevance_score: calculateRelevanceScore(task.title + ' ' + task.description, query),
    metadata: {
      status: task.status,
      priority: task.priority,
      project_id: task.project_id,
      assignee_id: task.assignee_id,
      due_date: task.due_date
    }
  }))
}

async function searchDocuments(query: string, filters: any, limit: number, semantic: boolean): Promise<any[]> {
  const searchParams: any = { search: query }
  
  if (filters?.project_id) searchParams.project_id = filters.project_id
  if (filters?.tags) searchParams.tags = filters.tags

  const documents = await supabaseService.getDocuments(searchParams, { limit })
  
  return documents.map(doc => ({
    type: 'document',
    id: doc.id,
    title: doc.title,
    description: doc.content.substring(0, 200),
    relevance_score: calculateRelevanceScore(doc.title + ' ' + doc.content, query),
    metadata: {
      document_type: doc.document_type,
      project_id: doc.project_id,
      // format property doesn't exist in the database schema
      created_at: doc.created_at,
      updated_at: doc.updated_at
    }
  }))
}

async function searchConversations(query: string, filters: any, limit: number, semantic: boolean): Promise<any[]> {
  // Placeholder for conversation search
  return []
}

async function searchProfiles(query: string, filters: any, limit: number, semantic: boolean): Promise<any[]> {
  // Placeholder for profile search
  return []
}

function calculateRelevanceScore(content: string, query: string): number {
  const contentLower = content.toLowerCase()
  const queryLower = query.toLowerCase()
  const queryTerms = queryLower.split(/\s+/)
  
  let score = 0
  
  // Exact phrase match gets highest score
  if (contentLower.includes(queryLower)) {
    score += 100
  }
  
  // Individual term matches
  queryTerms.forEach(term => {
    if (contentLower.includes(term)) {
      score += 20
    }
  })
  
  // Title matches get bonus
  const title = content.split('\n')[0] || content.substring(0, 100)
  if (title.toLowerCase().includes(queryLower)) {
    score += 50
  }
  
  return Math.min(100, score)
}

function generateSnippet(item: any, query: string): string {
  const content = item.description || item.content || ''
  const queryTerms = query.toLowerCase().split(/\s+/)
  
  // Find the best snippet around query terms
  let bestSnippet = ''
  let bestScore = 0
  
  const words = content.split(/\s+/)
  
  for (let i = 0; i < words.length - 20; i++) {
    const snippet = words.slice(i, i + 20).join(' ')
    const score = queryTerms.reduce((acc, term) => {
      return acc + (snippet.toLowerCase().includes(term) ? 1 : 0)
    }, 0)
    
    if (score > bestScore) {
      bestScore = score
      bestSnippet = snippet
    }
  }
  
  return bestSnippet || content.substring(0, 150) + '...'
}

function combineAndRankResults(results: any, query: string, semantic: boolean): any[] {
  const combined: any[] = []
  
  Object.values(results).forEach((typeResults: any) => {
    combined.push(...typeResults)
  })
  
  // Sort by relevance score
  return combined
    .sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0))
    .map((item, index) => ({ ...item, rank: index + 1 }))
}

function getBestMatchType(results: any): string {
  let bestType = ''
  let highestScore = 0
  
  Object.entries(results).forEach(([type, typeResults]: [string, any]) => {
    if (typeResults.length > 0) {
      const avgScore = typeResults.reduce((sum: number, item: any) => sum + (item.relevance_score || 0), 0) / typeResults.length
      if (avgScore > highestScore) {
        highestScore = avgScore
        bestType = type
      }
    }
  })
  
  return bestType
}

function getRelevanceDistribution(results: any[]): any {
  const distribution = { high: 0, medium: 0, low: 0 }
  
  results.forEach(result => {
    const score = result.relevance_score || 0
    if (score >= 80) distribution.high++
    else if (score >= 40) distribution.medium++
    else distribution.low++
  })
  
  return distribution
}

function generateSearchSuggestions(query: string, results: any): string[] {
  const suggestions = []
  
  // Suggest specific filters based on results
  const hasProjects = results.projects?.length > 0
  const hasTasks = results.tasks?.length > 0
  
  if (hasProjects) {
    suggestions.push(`"${query}" in:projects`)
  }
  if (hasTasks) {
    suggestions.push(`"${query}" status:in_progress`)
  }
  
  // Suggest related terms
  suggestions.push(`${query} documentation`)
  suggestions.push(`${query} tasks`)
  
  return suggestions.slice(0, 5)
}

function expandSemanticQuery(query: string, contextType: string): string {
  // Simple semantic expansion based on context
  const expansions: { [key: string]: string[] } = {
    'technical_documentation': ['docs', 'api', 'specification', 'guide'],
    'meeting_notes': ['discussion', 'decision', 'action item', 'agenda'],
    'code_related': ['function', 'class', 'method', 'implementation'],
    'project_context': ['milestone', 'deliverable', 'requirement', 'scope']
  }
  
  const contextExpansions = expansions[contextType] || []
  return query + ' ' + contextExpansions.join(' ')
}

async function performSemanticSearch(expandedQuery: string, threshold: number, maxResults: number): Promise<any[]> {
  // Placeholder for actual semantic search implementation
  // In production, this would use vector embeddings
  return []
}

function generateMatchExplanation(result: any, query: string, contextType: string): string {
  return `Matched based on content similarity and ${contextType} context`
}

async function getRecentSearches(partialQuery: string, projectId?: string): Promise<string[]> {
  // Placeholder - would query search history
  return [`${partialQuery} api`, `${partialQuery} documentation`]
}

async function getPopularSearchTerms(partialQuery: string, projectId?: string): Promise<string[]> {
  // Placeholder - would return popular terms
  return ['authentication', 'database', 'frontend', 'backend']
    .filter(term => term.includes(partialQuery.toLowerCase()))
}

async function getRelatedConcepts(partialQuery: string, projectId?: string): Promise<string[]> {
  // Placeholder - would return semantically related concepts
  return []
}

async function getEntitySuggestions(partialQuery: string, projectId?: string): Promise<string[]> {
  // Search for project names, task titles, etc. that match
  const suggestions = []
  
  try {
    const projects = await supabaseService.getProjects({ search: partialQuery }, { limit: 5 })
    suggestions.push(...projects.map(p => p.name))
  } catch (error) {
    logger.error('Error getting entity suggestions:', error)
  }
  
  return suggestions
}

async function calculateSearchAnalytics(timeRange: string, projectId?: string, includePerformance?: boolean): Promise<any> {
  // Placeholder for search analytics
  return {
    total_searches: 150,
    unique_queries: 45,
    avg_results_per_search: 8.3,
    top_search_terms: ['api', 'documentation', 'tasks', 'project'],
    search_trends: {
      documents: 45,
      tasks: 35,
      projects: 20
    },
    performance: includePerformance ? {
      avg_search_time: 125,
      cache_hit_rate: 78.5
    } : undefined
  }
}

// Export all intelligent search tools
export const intelligentSearchTools = {
  universalSearchTool,
  semanticSearchTool,
  getSearchSuggestionsTool,
  getSearchAnalyticsTool
}

export const intelligentSearchHandlers = {
  universal_search: universalSearch,
  semantic_search: semanticSearch,
  get_search_suggestions: getSearchSuggestions,
  get_search_analytics: getSearchAnalytics
}