# Semantic Search Implementation with Supabase

## Overview

Supabase supports semantic search natively through the pgvector extension, which enables vector similarity search directly in PostgreSQL. This allows us to implement AI-powered semantic search without additional infrastructure.

## Architecture

```
User Query → OpenAI Embeddings API → Vector Search (pgvector) → Ranked Results
```

## Implementation Steps

### 1. Enable pgvector Extension in Supabase

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;
```

### 2. Add Embedding Columns to Tables

```sql
-- Add embedding columns to existing tables
ALTER TABLE documents ADD COLUMN embedding vector(1536);
ALTER TABLE tasks ADD COLUMN embedding vector(1536);
ALTER TABLE projects ADD COLUMN embedding vector(1536);

-- Create indexes for fast similarity search
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

### 3. Create Embedding Generation Function

```sql
-- Function to update embeddings (called from application)
CREATE OR REPLACE FUNCTION update_document_embedding(
  doc_id UUID,
  embedding_vector vector
)
RETURNS void AS $$
BEGIN
  UPDATE documents 
  SET embedding = embedding_vector
  WHERE id = doc_id;
END;
$$ LANGUAGE plpgsql;
```

### 4. Create Similarity Search Functions

```sql
-- Semantic search function for documents
CREATE OR REPLACE FUNCTION search_documents_semantic(
  query_embedding vector,
  similarity_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10,
  user_id_filter UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  content TEXT,
  similarity float
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    d.id,
    d.title,
    d.content,
    1 - (d.embedding <=> query_embedding) as similarity
  FROM documents d
  JOIN projects p ON d.project_id = p.id
  WHERE 
    (user_id_filter IS NULL OR p.user_id = user_id_filter)
    AND d.embedding IS NOT NULL
    AND 1 - (d.embedding <=> query_embedding) > similarity_threshold
  ORDER BY d.embedding <=> query_embedding
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

### 5. Create Hybrid Search (Combines Semantic + Keyword)

```sql
-- Hybrid search combining semantic and full-text search
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

## API Implementation

### 1. Update Helios9 API Endpoints

Create new endpoint: `/app/api/mcp/search/semantic/route.ts`

```typescript
import { createClient } from '@/lib/supabase/server'
import { authenticateMcpApiKey } from '@/lib/auth/mcp'
import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export async function POST(request: NextRequest) {
  try {
    const userId = await authenticateMcpApiKey(request)
    if (!userId) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }

    const { query, search_types, similarity_threshold = 0.5, max_results = 10 } = await request.json()

    // Generate embedding for the query
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
    })
    
    const queryEmbedding = embeddingResponse.data[0].embedding

    const supabase = await createClient()
    const results = {
      documents: [],
      tasks: [],
      projects: []
    }

    // Search documents
    if (search_types.includes('documents')) {
      const { data: docs } = await supabase.rpc('search_documents_semantic', {
        query_embedding: queryEmbedding,
        similarity_threshold,
        match_count: max_results,
        user_id_filter: userId
      })
      results.documents = docs || []
    }

    // Search tasks
    if (search_types.includes('tasks')) {
      const { data: tasks } = await supabase.rpc('search_tasks_semantic', {
        query_embedding: queryEmbedding,
        similarity_threshold,
        match_count: max_results,
        user_id_filter: userId
      })
      results.tasks = tasks || []
    }

    return NextResponse.json({
      query,
      results,
      total_results: results.documents.length + results.tasks.length
    })

  } catch (error) {
    console.error('Semantic search error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

### 2. Update MCP Server API Client

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

### 3. Update Semantic Search Tool Handler

In `src/tools/intelligent-search.ts`:

```typescript
export const semanticSearch = requireAuth(async (args: any) => {
  const { query, context_type, similarity_threshold, max_results, include_explanations } = SemanticSearchSchema.parse(args)
  
  logger.info('Performing semantic search', { query, context_type, similarity_threshold })

  // Use the new semantic search API
  const searchResults = await supabaseService.semanticSearch(query, {
    search_types: getSearchTypesForContext(context_type),
    similarity_threshold,
    max_results
  })
  
  // Format results for MCP
  const formattedResults = formatSemanticResults(searchResults, include_explanations)
  
  return {
    query,
    context_type,
    results: formattedResults,
    total_results: formattedResults.length,
    search_metadata: {
      similarity_threshold,
      embeddings_model: 'text-embedding-3-small'
    }
  }
})
```

## Embedding Generation Strategy

### 1. Real-time Embedding Generation

Add webhook or background job to generate embeddings when content is created/updated:

```typescript
// In document creation/update endpoints
async function generateAndStoreEmbedding(content: string, recordId: string, tableName: string) {
  const embedding = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: content,
  })
  
  await supabase.rpc(`update_${tableName}_embedding`, {
    record_id: recordId,
    embedding_vector: embedding.data[0].embedding
  })
}
```

### 2. Batch Embedding Generation

For existing data, create a migration script:

```typescript
async function backfillEmbeddings() {
  // Get all documents without embeddings
  const { data: documents } = await supabase
    .from('documents')
    .select('id, title, content')
    .is('embedding', null)
    .limit(100)

  for (const doc of documents) {
    const text = `${doc.title} ${doc.content}`.slice(0, 8000) // Token limit
    await generateAndStoreEmbedding(text, doc.id, 'documents')
    // Add delay to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 100))
  }
}
```

## Cost Optimization

1. **Use text-embedding-3-small**: 5x cheaper than ada-002, better performance
2. **Cache embeddings**: Store in database, only generate once
3. **Truncate content**: Limit to 8K tokens before embedding
4. **Batch operations**: Process multiple items in single API calls

## Performance Optimization

1. **Use IVFFlat indexes**: Faster than exact search for large datasets
2. **Hybrid search**: Combine with full-text search for better results
3. **Prefilter by user**: Reduce search space using RLS
4. **Limit result count**: Return top N results only

## Estimated Costs

- OpenAI Embeddings: ~$0.02 per 1M tokens
- Average document: ~500 tokens = $0.00001 per document
- 10,000 documents = ~$0.10 for initial embeddings
- Ongoing: ~$0.01/month for 1000 new documents

## Security Considerations

1. **RLS still applies**: Embeddings respect row-level security
2. **API key protection**: Store OpenAI key securely
3. **Rate limiting**: Implement to prevent abuse
4. **Input sanitization**: Clean queries before embedding

## Next Steps

1. Create database migration to add pgvector and embedding columns
2. Implement embedding generation in document/task creation flows
3. Create semantic search API endpoint
4. Update MCP tools to use new semantic search
5. Backfill embeddings for existing content