# Helios-9 MCP Server - Correct SaaS Architecture

## Architecture Overview

```
AI Assistant (Claude) → MCP Server → Helios-9 SaaS API → Supabase Database
```

**NOT**: ~~MCP Server → Direct Database Access~~ ❌

## Correct Authentication Flow

### 1. User Gets API Key from Helios-9 SaaS
- User logs into their Helios-9 account
- Goes to Settings → API Keys
- Generates a new API key for MCP access
- API key is tied to their user account and permissions

### 2. MCP Server Authenticates with SaaS
- MCP server uses the API key to call Helios-9 web APIs
- All requests go through `/app/api/` routes
- SaaS application handles database access with its own credentials
- Maintains proper multi-tenancy and security

### 3. SaaS Application Handles Database
- Web application authenticates to Supabase with its own credentials
- Enforces Row Level Security (RLS) based on authenticated user
- Returns data to MCP server via API responses

## Required Changes

### 1. Create API Key Management System

**Add to Helios-9 SaaS**:
```typescript
// app/api/auth/api-keys/route.ts
export async function POST(request: Request) {
  // Generate API key for authenticated user
  // Store in database with user_id association
  // Return API key to user
}

export async function GET(request: Request) {
  // List user's API keys
}

export async function DELETE(request: Request) {
  // Revoke API key
}
```

### 2. Create MCP API Endpoints

**Add to Helios-9 SaaS**:
```typescript
// app/api/mcp/projects/route.ts
export async function GET(request: Request) {
  // Authenticate via API key header
  // Call existing project logic
  // Return JSON for MCP server
}

// app/api/mcp/tasks/route.ts
// app/api/mcp/documents/route.ts
// etc.
```

### 3. Update MCP Server to Call SaaS APIs

**Instead of direct database access**:
```typescript
// packages/mcp-server/src/lib/helios-client.ts
class HeliosClient {
  constructor(private apiKey: string, private baseUrl: string) {}
  
  async getProjects() {
    const response = await fetch(`${this.baseUrl}/api/mcp/projects`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    })
    return response.json()
  }
}
```

## Security Benefits

✅ **Proper Multi-tenancy**: Each API key is tied to a specific user
✅ **No Database Exposure**: MCP server never sees database credentials
✅ **Centralized Authentication**: All auth goes through the SaaS app
✅ **Rate Limiting**: Can implement per-API-key rate limits
✅ **Audit Trail**: All MCP requests logged through SaaS app
✅ **Easy Revocation**: API keys can be instantly revoked

## Implementation Priority

This is a **critical architectural fix** that should be implemented before the MCP server can be used safely in production.