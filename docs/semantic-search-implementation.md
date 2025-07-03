# Semantic Search Implementation with Supabase

## Overview

Supabase supports semantic search natively through the pgvector extension, which enables vector similarity search directly in PostgreSQL. This allows us to implement AI-powered semantic search without additional infrastructure.

## Architecture

```
[MCP Tool Request] → [MCP Server] → [Helios-9 API] → [LLM Provider] → [pgvector] → [Results]
         ↓                  ↓               ↓              ↓
   semantic_search    Uses MCP      Uses stored      Generates      Vector
      tool call        API Key       LLM API Key     embeddings     search
```

## Key Design Decisions

1. **LLM API Keys Stay in Main App**: User's OpenAI/Anthropic/VoyageAI keys are securely stored and encrypted in the main Helios-9 application
2. **MCP Server as Thin Client**: MCP server authenticates with Helios-9 API key and forwards requests
3. **BYOK Model**: Users manage their own LLM provider keys for embeddings and AI features
4. **Multi-Provider Support**: 
   - **OpenAI**: Best value, general purpose
   - **VoyageAI**: Superior quality, larger context (32K), specialized models for code
5. **Document Chunking**: Large documents are split into overlapping chunks (less needed with VoyageAI)

## Main Application Tasks (Helios-9 SaaS)

### 1. Database Setup

#### Enable pgvector Extension
```sql
-- Run in Supabase SQL Editor
CREATE EXTENSION IF NOT EXISTS vector;
```

#### Add Embedding Support to Tables

```sql
-- Add support for multiple embedding providers
CREATE TYPE embedding_provider AS ENUM ('openai', 'anthropic', 'voyageai');

-- Update users table for provider preferences
ALTER TABLE users ADD COLUMN preferred_embedding_provider embedding_provider DEFAULT 'openai';
ALTER TABLE users ADD COLUMN voyageai_api_key_id UUID REFERENCES api_keys(id);

-- Support for document chunking
CREATE TABLE document_chunks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536),
  token_count INTEGER,
  start_char INTEGER,
  end_char INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(document_id, chunk_index)
);

-- Add embedding columns to existing tables
ALTER TABLE documents ADD COLUMN embedding vector(1536);
ALTER TABLE documents ADD COLUMN embedding_provider embedding_provider;
ALTER TABLE documents ADD COLUMN embedding_model TEXT;
ALTER TABLE documents ADD COLUMN embedding_updated_at TIMESTAMPTZ;

ALTER TABLE tasks ADD COLUMN embedding vector(1536);
ALTER TABLE tasks ADD COLUMN embedding_provider embedding_provider;
ALTER TABLE tasks ADD COLUMN embedding_model TEXT;

ALTER TABLE projects ADD COLUMN embedding vector(1536);
ALTER TABLE projects ADD COLUMN embedding_provider embedding_provider;
ALTER TABLE projects ADD COLUMN embedding_model TEXT;

-- Create indexes for fast similarity search (IVFFlat for speed)
CREATE INDEX document_chunks_embedding_idx ON document_chunks 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

CREATE INDEX documents_embedding_idx ON documents 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

CREATE INDEX tasks_embedding_idx ON tasks 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

CREATE INDEX projects_embedding_idx ON projects 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

### 2. Create Database Functions

#### Embedding Update Functions
```sql
-- Update document embedding
CREATE OR REPLACE FUNCTION update_document_embedding(
  doc_id UUID,
  embedding_vector vector,
  model_name TEXT
)
RETURNS void AS $$
BEGIN
  UPDATE documents 
  SET 
    embedding = embedding_vector,
    embedding_model = model_name,
    embedding_updated_at = NOW()
  WHERE id = doc_id;
END;
$$ LANGUAGE plpgsql;

-- Update document chunk embeddings
CREATE OR REPLACE FUNCTION update_document_chunk_embedding(
  chunk_id UUID,
  embedding_vector vector
)
RETURNS void AS $$
BEGIN
  UPDATE document_chunks 
  SET embedding = embedding_vector
  WHERE id = chunk_id;
END;
$$ LANGUAGE plpgsql;
```

#### Search Functions

```sql
-- Semantic search with document chunks
CREATE OR REPLACE FUNCTION search_documents_with_chunks(
  query_embedding vector,
  similarity_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10,
  user_id_filter UUID DEFAULT NULL
)
RETURNS TABLE (
  document_id UUID,
  title TEXT,
  project_id UUID,
  relevant_chunks JSONB,
  max_similarity float,
  avg_similarity float
) AS $$
BEGIN
  RETURN QUERY
  WITH chunk_matches AS (
    SELECT 
      d.id as document_id,
      d.title,
      d.project_id,
      c.chunk_index,
      c.content,
      1 - (c.embedding <=> query_embedding) as similarity
    FROM documents d
    JOIN document_chunks c ON d.id = c.document_id
    JOIN projects p ON d.project_id = p.id
    WHERE 
      (user_id_filter IS NULL OR p.user_id = user_id_filter)
      AND c.embedding IS NOT NULL
      AND 1 - (c.embedding <=> query_embedding) > similarity_threshold
  ),
  aggregated AS (
    SELECT 
      document_id,
      title,
      project_id,
      jsonb_agg(
        jsonb_build_object(
          'chunk_index', chunk_index,
          'content', content,
          'similarity', similarity
        ) ORDER BY similarity DESC
      ) as relevant_chunks,
      MAX(similarity) as max_similarity,
      AVG(similarity) as avg_similarity
    FROM chunk_matches
    GROUP BY document_id, title, project_id
  )
  SELECT * FROM aggregated
  ORDER BY max_similarity DESC
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- Similar functions for tasks and projects
CREATE OR REPLACE FUNCTION search_tasks_semantic(
  query_embedding vector,
  similarity_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10,
  user_id_filter UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  similarity float
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id,
    t.title,
    t.description,
    1 - (t.embedding <=> query_embedding) as similarity
  FROM tasks t
  JOIN projects p ON t.project_id = p.id
  WHERE 
    (user_id_filter IS NULL OR p.user_id = user_id_filter)
    AND t.embedding IS NOT NULL
    AND 1 - (t.embedding <=> query_embedding) > similarity_threshold
  ORDER BY t.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;
```

#### Hybrid Search (Semantic + Keyword)
```sql
CREATE OR REPLACE FUNCTION hybrid_search_documents(
  query_text TEXT,
  query_embedding vector,
  similarity_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10,
  user_id_filter UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  content TEXT,
  semantic_similarity float,
  text_rank float,
  combined_score float
) AS $$
BEGIN
  RETURN QUERY
  WITH semantic_results AS (
    SELECT 
      d.id,
      d.title,
      d.content,
      1 - (d.embedding <=> query_embedding) as semantic_similarity
    FROM documents d
    JOIN projects p ON d.project_id = p.id
    WHERE 
      (user_id_filter IS NULL OR p.user_id = user_id_filter)
      AND d.embedding IS NOT NULL
  ),
  text_results AS (
    SELECT 
      d.id,
      ts_rank(to_tsvector('english', d.title || ' ' || d.content), 
              plainto_tsquery('english', query_text)) as text_rank
    FROM documents d
    JOIN projects p ON d.project_id = p.id
    WHERE 
      (user_id_filter IS NULL OR p.user_id = user_id_filter)
      AND to_tsvector('english', d.title || ' ' || d.content) @@ 
          plainto_tsquery('english', query_text)
  )
  SELECT 
    s.id,
    s.title,
    s.content,
    s.semantic_similarity,
    COALESCE(t.text_rank, 0) as text_rank,
    (0.7 * s.semantic_similarity + 0.3 * COALESCE(t.text_rank, 0)) as combined_score
  FROM semantic_results s
  LEFT JOIN text_results t ON s.id = t.id
  WHERE s.semantic_similarity > similarity_threshold
  ORDER BY combined_score DESC
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;
```

### 3. API Implementation

#### Semantic Search Endpoint
Create `/app/api/mcp/search/semantic/route.ts`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { authenticateMcpApiKey } from '@/lib/auth/mcp'
import { getEmbeddingProvider } from '@/lib/embeddings'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate MCP request
    const userId = await authenticateMcpApiKey(request)
    if (!userId) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }

    const { query, search_types, similarity_threshold = 0.5, max_results = 10 } = await request.json()
    const supabase = await createClient()

    // 2. Get user's embedding provider configuration
    const { data: user } = await supabase
      .from('users')
      .select(`
        preferred_embedding_provider,
        openai_key:api_keys!users_openai_api_key_id_fkey(decrypted_key),
        anthropic_key:api_keys!users_anthropic_api_key_id_fkey(decrypted_key),
        voyageai_key:api_keys!users_voyageai_api_key_id_fkey(decrypted_key)
      `)
      .eq('id', userId)
      .single()

    if (!user?.openai_key && !user?.voyageai_key) {
      return NextResponse.json({ 
        error: 'No embedding provider configured. Please add an OpenAI or VoyageAI API key in settings.' 
      }, { status: 400 })
    }

    // 3. Generate embedding using user's provider
    const embeddingProvider = getEmbeddingProvider(user)
    const queryEmbedding = await embeddingProvider.createEmbedding(query)

    // 4. Perform searches
    const results = {
      documents: [],
      tasks: [],
      projects: []
    }

    if (search_types.includes('documents')) {
      const { data: docs } = await supabase.rpc('search_documents_with_chunks', {
        query_embedding: queryEmbedding,
        similarity_threshold,
        match_count: max_results,
        user_id_filter: userId
      })
      results.documents = docs || []
    }

    if (search_types.includes('tasks')) {
      const { data: tasks } = await supabase.rpc('search_tasks_semantic', {
        query_embedding: queryEmbedding,
        similarity_threshold,
        match_count: max_results,
        user_id_filter: userId
      })
      results.tasks = tasks || []
    }

    // 5. Track usage for billing
    await trackEmbeddingUsage(userId, 'semantic_search', query.length)

    return NextResponse.json({
      query,
      results,
      total_results: results.documents.length + results.tasks.length,
      embedding_model: embeddingProvider.model
    })

  } catch (error) {
    console.error('Semantic search error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

#### Embedding Provider Service
Create `/lib/embeddings/index.ts`:

```typescript
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'

interface EmbeddingProvider {
  createEmbedding(text: string): Promise<number[]>
  model: string
  dimensions: number
  provider: string
}

export function getEmbeddingProvider(user: any): EmbeddingProvider {
  // Check for VoyageAI first (often better for domain-specific content)
  if (user.voyageai_key) {
    return {
      provider: 'voyageai',
      model: 'voyage-large-2',
      dimensions: 1536,
      createEmbedding: async (text: string) => {
        const response = await fetch('https://api.voyageai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${user.voyageai_key.decrypted_key}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            input: text.slice(0, 120000), // VoyageAI supports up to 120k characters
            model: 'voyage-large-2'
          })
        })
        
        const data = await response.json()
        return data.data[0].embedding
      }
    }
  }
  
  // Fall back to OpenAI
  if (user.openai_key) {
    const openai = new OpenAI({ apiKey: user.openai_key.decrypted_key })
    
    return {
      provider: 'openai',
      model: 'text-embedding-3-small',
      dimensions: 1536,
      createEmbedding: async (text: string) => {
        const response = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: text.slice(0, 8000) // Token limit
        })
        return response.data[0].embedding
      }
    }
  }
  
  // When Anthropic releases embeddings, add support here
  
  throw new Error('No embedding provider available. Please configure OpenAI or VoyageAI API key.')
}
```

#### Advanced Embedding Provider Selection
Create `/lib/embeddings/provider-selection.ts`:

```typescript
interface ProviderConfig {
  provider: string
  model: string
  dimensions: number
  maxTokens: number
  costPer1MTokens: number
}

const PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  'voyageai-large': {
    provider: 'voyageai',
    model: 'voyage-large-2',
    dimensions: 1536,
    maxTokens: 32000,
    costPer1MTokens: 0.12
  },
  'voyageai-code': {
    provider: 'voyageai',
    model: 'voyage-code-2',
    dimensions: 1536,
    maxTokens: 16000,
    costPer1MTokens: 0.12
  },
  'openai-small': {
    provider: 'openai',
    model: 'text-embedding-3-small',
    dimensions: 1536,
    maxTokens: 8191,
    costPer1MTokens: 0.02
  },
  'openai-large': {
    provider: 'openai',
    model: 'text-embedding-3-large',
    dimensions: 3072,
    maxTokens: 8191,
    costPer1MTokens: 0.13
  }
}

export function selectOptimalProvider(
  user: any, 
  contentType: 'general' | 'code' | 'mixed' = 'general'
): ProviderConfig {
  // For code-heavy content, prefer VoyageAI Code model
  if (contentType === 'code' && user.voyageai_key) {
    return PROVIDER_CONFIGS['voyageai-code']
  }
  
  // For general content, prefer VoyageAI Large for better quality
  if (user.voyageai_key && user.preferred_embedding_provider === 'voyageai') {
    return PROVIDER_CONFIGS['voyageai-large']
  }
  
  // Fall back to OpenAI
  if (user.openai_key) {
    return user.prefer_quality_over_cost 
      ? PROVIDER_CONFIGS['openai-large']
      : PROVIDER_CONFIGS['openai-small']
  }
  
  throw new Error('No embedding provider available')
}
```

#### Document Chunking Service
Create `/lib/embeddings/chunking.ts`:

```typescript
interface DocumentChunk {
  content: string
  start_char: number
  end_char: number
  token_estimate: number
}

export function chunkDocument(content: string, maxTokens: number = 1500): DocumentChunk[] {
  const chunks: DocumentChunk[] = []
  const paragraphs = content.split(/\n\n+/)
  
  let currentChunk = ''
  let currentStart = 0
  let position = 0
  
  for (const paragraph of paragraphs) {
    const paragraphTokens = estimateTokens(paragraph)
    const currentTokens = estimateTokens(currentChunk)
    
    if (currentTokens + paragraphTokens > maxTokens && currentChunk) {
      chunks.push({
        content: currentChunk.trim(),
        start_char: currentStart,
        end_char: position,
        token_estimate: currentTokens
      })
      currentChunk = paragraph
      currentStart = position
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph
    }
    
    position += paragraph.length + 2 // +2 for \n\n
  }
  
  if (currentChunk) {
    chunks.push({
      content: currentChunk.trim(),
      start_char: currentStart,
      end_char: content.length,
      token_estimate: estimateTokens(currentChunk)
    })
  }
  
  return chunks
}

function estimateTokens(text: string): number {
  // Rough estimate: ~4 characters per token
  return Math.ceil(text.length / 4)
}
```

### 4. Embedding Generation Webhooks

#### Document Update Webhook
Create `/app/api/webhooks/embeddings/documents/route.ts`:

```typescript
export async function POST(request: Request) {
  const { type, record } = await request.json()
  
  if (type === 'INSERT' || type === 'UPDATE') {
    // Queue embedding generation
    await queueEmbeddingGeneration({
      entity_type: 'document',
      entity_id: record.id,
      content: `${record.title}\n\n${record.content}`,
      user_id: record.user_id
    })
  }
  
  return Response.json({ success: true })
}
```

## MCP Server Tasks

### 1. Update API Client
In `src/lib/api-client.ts`:

```typescript
async semanticSearch(query: string, options: {
  search_types?: string[],
  similarity_threshold?: number,
  max_results?: number
} = {}): Promise<any> {
  const response = await this.request('/api/mcp/search/semantic', {
    method: 'POST',
    body: JSON.stringify({
      query,
      search_types: options.search_types || ['documents', 'tasks', 'projects'],
      similarity_threshold: options.similarity_threshold || 0.5,
      max_results: options.max_results || 10
    })
  })
  
  return response
}
```

### 2. Update Semantic Search Tool
In `src/tools/intelligent-search.ts`:

```typescript
export const semanticSearch = requireAuth(async (args: any) => {
  const { query, context_type, similarity_threshold, max_results, include_explanations } = SemanticSearchSchema.parse(args)
  
  logger.info('Performing semantic search', { query, context_type, similarity_threshold })

  // Delegate to main app API
  const searchResults = await apiClient.semanticSearch(query, {
    search_types: getSearchTypesForContext(context_type),
    similarity_threshold,
    max_results
  })
  
  // Format results for AI agent consumption
  const formattedResults = formatSemanticResults(searchResults, include_explanations)
  
  return {
    query,
    context_type,
    results: formattedResults,
    total_results: formattedResults.length,
    search_metadata: {
      similarity_threshold,
      embeddings_model: searchResults.embedding_model
    }
  }
})

// Helper to format results with context
function formatSemanticResults(results: any, includeExplanations: boolean) {
  const formatted = []
  
  // Format document results with chunks
  for (const doc of results.documents || []) {
    formatted.push({
      type: 'document',
      id: doc.document_id,
      title: doc.title,
      project_id: doc.project_id,
      similarity: doc.max_similarity,
      relevant_sections: doc.relevant_chunks.map((chunk: any) => ({
        content: chunk.content,
        similarity: chunk.similarity
      })),
      explanation: includeExplanations ? 
        `Found ${doc.relevant_chunks.length} relevant sections with ${Math.round(doc.max_similarity * 100)}% similarity` : 
        undefined
    })
  }
  
  // Format task results
  for (const task of results.tasks || []) {
    formatted.push({
      type: 'task',
      id: task.id,
      title: task.title,
      description: task.description,
      similarity: task.similarity,
      explanation: includeExplanations ?
        `Task matches query with ${Math.round(task.similarity * 100)}% similarity` :
        undefined
    })
  }
  
  return formatted
}
```

## Implementation Checklist

### Main Application (Helios-9)
- [ ] Enable pgvector extension in Supabase
- [ ] Run database migrations for embedding columns and chunks table
- [ ] Create SQL functions for search and embedding updates
- [ ] Implement `/api/mcp/search/semantic` endpoint
- [ ] Create embedding provider service with OpenAI support
- [ ] Implement document chunking service
- [ ] Set up webhooks for automatic embedding generation
- [ ] Create background job for embedding backfill
- [ ] Add usage tracking for billing

### MCP Server
- [ ] Update `api-client.ts` with semantic search method
- [ ] Enhance `intelligent-search.ts` tool to use new API
- [ ] Add result formatting helpers for AI consumption
- [ ] Update tool descriptions and parameters
- [ ] Test integration with main app API

## Cost & Performance Considerations

### Cost Optimization
- **Model Choice**: 
  - OpenAI text-embedding-3-small: $0.02/1M tokens (best value)
  - VoyageAI voyage-large-2: $0.12/1M tokens (better quality)
  - VoyageAI voyage-code-2: $0.12/1M tokens (optimized for code)
- **Smart Chunking**: Only embed meaningful content chunks
- **Caching**: Store embeddings permanently, regenerate only on significant changes
- **Batch Processing**: Group embedding requests to reduce API calls

### Performance Optimization
- **VoyageAI Advantages**:
  - 4x larger context window (32K vs 8K tokens)
  - Better domain-specific performance
  - No need for aggressive chunking
- **Indexing**: IVFFlat indexes balance speed and accuracy
- **User Filtering**: Apply RLS before vector operations
- **Result Limiting**: Return top N results to reduce payload size
- **Hybrid Search**: Combine with keyword search for better coverage

### Cost Estimates
| Provider | Model | Initial 10K docs | Monthly 1K docs | Per Search |
|----------|-------|------------------|-----------------|------------|
| OpenAI | text-embedding-3-small | ~$0.10 | ~$0.01 | ~$0.00002 |
| VoyageAI | voyage-large-2 | ~$0.60 | ~$0.06 | ~$0.00012 |
| VoyageAI | voyage-code-2 | ~$0.60 | ~$0.06 | ~$0.00012 |

## Security & Privacy

1. **API Key Isolation**: LLM keys never leave main app
2. **Row-Level Security**: All searches respect user permissions
3. **Input Validation**: Sanitize queries before processing
4. **Rate Limiting**: Prevent abuse at API level
5. **Audit Trail**: Log searches for security monitoring

## Future Enhancements

### Phase 2 Features
- Anthropic embeddings (when available)
- Cohere embeddings integration
- Relevance feedback and learning
- Query expansion and synonyms
- Smart summarization of results
- Search analytics dashboard
- Auto-detect content type for optimal model selection

### Phase 3 Features
- Cross-project semantic search
- Team-wide knowledge graph
- Automatic tagging based on embeddings
- Similar item recommendations
- Natural language project navigation
- Multi-modal search (images, diagrams)
- Custom fine-tuned embeddings