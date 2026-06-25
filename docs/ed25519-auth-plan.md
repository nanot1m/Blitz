# Ed25519 authentication plan

## Status

This is a deferred design for a hosted, multi-user Blitz MCP service. The current implementation remains a local `stdio` MCP server with an authenticated localhost WebSocket bridge.

The hosted implementation should not require users to create accounts with a third-party identity provider. A client installation will instead generate an Ed25519 key pair locally and register its public key with Blitz.

## Design decisions

- The Ed25519 private key never leaves the client installation.
- A registered public key identifies a client installation, not a human.
- Initial registration requires a short-lived, single-use invitation.
- Ed25519 signatures authenticate a short-lived assertion at the token endpoint.
- The token endpoint returns a short-lived bearer access token for normal MCP requests.
- MCP request bodies are not signed individually. Using bearer tokens keeps the transport compatible with standard Streamable HTTP MCP clients and avoids signing streaming bodies.
- Every access token is scoped to one tenant and one client.
- Canvas authorization is checked for every tool call, not only when an MCP session starts.

## Target flow

```text
Administrator
    │ creates single-use tenant invitation
    ▼
Client installation
    │ generates Ed25519 key pair locally
    │ submits public key + invitation
    ▼
Blitz registration endpoint
    │ stores public key and returns client ID
    ▼
Client installation
    │ signs a 60-second client assertion
    ▼
Blitz token endpoint
    │ verifies signature and replay protection
    │ returns a 5-minute access token
    ▼
MCP Streamable HTTP endpoint
    │ validates token, tenant, client, scopes, and canvas access
    ▼
Tenant-owned canvas connection
```

## Credential lifecycle

### Key generation

The MCP client generates an Ed25519 key pair using the operating system cryptographic random source. The private key should be stored in the OS keychain when the client supports it. A file-based fallback must use owner-only permissions.

The public key is encoded as JWK and receives an RFC 7638 thumbprint. The thumbprint can be used as the stable key identifier.

### Registration

An administrator creates an invitation containing:

- A random 256-bit secret
- Tenant ID
- Initial scopes
- Expiration, no longer than 24 hours
- Maximum use count of one

Only a SHA-256 hash of the invitation secret is stored. Registration atomically consumes the invitation and creates the client record.

Proposed endpoint:

```http
POST /v1/clients/register
Content-Type: application/json

{
  "invitation": "blz_invite_...",
  "name": "Alice laptop",
  "publicKey": {
    "kty": "OKP",
    "crv": "Ed25519",
    "x": "..."
  }
}
```

Response:

```json
{
  "clientId": "client_...",
  "tenantId": "tenant_...",
  "keyId": "..."
}
```

### Client assertion

The client signs a compact JWT with EdDSA:

```json
{
  "alg": "EdDSA",
  "typ": "JWT",
  "kid": "registered-key-thumbprint"
}
```

```json
{
  "iss": "client_...",
  "sub": "client_...",
  "aud": "https://mcp.example.com/oauth/token",
  "iat": 1782399000,
  "exp": 1782399060,
  "jti": "128-bit-random-value"
}
```

Validation rules:

- `alg` is exactly `EdDSA`; algorithm selection is never taken from the key record.
- `iss` and `sub` match the registered client.
- `aud` exactly matches the token endpoint.
- `iat` permits only a small clock skew.
- `exp` is no more than 60 seconds after `iat`.
- `jti` has not been used before and is retained until assertion expiry.
- The client and key have not been revoked.

The token endpoint should follow the OAuth client credentials shape with `private_key_jwt` client authentication where supported by the target MCP SDK.

### Access token

Initially, use an EdDSA-signed JWT with:

```json
{
  "iss": "https://mcp.example.com",
  "sub": "client_...",
  "aud": "https://mcp.example.com/mcp",
  "tenant_id": "tenant_...",
  "scope": "blitz:canvas:read blitz:canvas:write",
  "iat": 1782399000,
  "exp": 1782399300,
  "jti": "..."
}
```

Access tokens expire after five minutes. Do not put canvas IDs directly in a general tenant token unless a client is intentionally restricted to a fixed canvas allowlist.

## Authorization model

Suggested scopes:

- `blitz:canvas:read`
- `blitz:canvas:write`
- `blitz:canvas:admin`

The authorization path for every MCP tool call is:

```text
validated token
  → active client
  → active tenant membership
  → required scope
  → canvas belongs to tenant
  → optional per-canvas grant
  → execute operation
```

Return a generic not-found result when a canvas does not exist or belongs to another tenant. This prevents cross-tenant resource enumeration.

## Storage model

Minimum PostgreSQL tables:

- `tenants`
- `clients`
- `client_keys`
- `invitations`
- `canvases`
- `canvas_grants`
- `audit_events`

Redis is optional for the first single-process deployment. It becomes required for:

- Assertion `jti` replay protection across replicas
- Short-lived browser bridge tickets
- Canvas connection presence
- Routing commands to the replica holding a canvas WebSocket

Long-lived credentials and grants remain in PostgreSQL.

## Browser canvas pairing

The MCP client credential must not be copied into the browser. The browser receives a separate, single-use bridge ticket containing:

- Client ID
- Tenant ID
- Canvas ID
- Audience `blitz-bridge`
- Expiration of 30–60 seconds
- Unique `jti`

The ticket is sent through `Sec-WebSocket-Protocol`, matching the local bridge's current browser-compatible approach. The server consumes the ticket once and binds the WebSocket to the tenant and canvas.

The hosted server replaces the current global `activeCanvas` with connections keyed by tenant and canvas ID.

## Revocation and recovery

- Administrators can revoke a client or an individual key immediately.
- Existing access tokens remain valid for at most five minutes unless a token denylist is introduced.
- A client can register a replacement key while its current key is valid.
- Lost private keys cannot be recovered. The administrator revokes the old client and issues a new invitation.
- Public key records retain creation, last-used, rotation, and revocation timestamps.

## Audit requirements

Record:

- Authentication success and failure without assertions or tokens
- Invitation creation, consumption, expiration, and revocation
- Client and key creation, rotation, and revocation
- MCP actor, tenant, canvas, tool name, result, and duration
- Browser bridge connection and disconnection

Never log invitation secrets, private keys, complete assertions, access tokens, or bridge tickets.

## Implementation phases

1. Extract canvas routing from `mcp/server.ts` so calls accept an explicit connection instead of using `activeCanvas`.
2. Add tenant, client, key, invitation, canvas, and audit persistence.
3. Implement invitation creation and public-key registration.
4. Implement Ed25519 assertion verification, strict claim validation, and replay protection.
5. Issue and verify five-minute access tokens.
6. Add Streamable HTTP MCP transport and protected-resource metadata.
7. Add tenant- and scope-aware authorization to every tool.
8. Add short-lived browser bridge tickets and tenant/canvas connection routing.
9. Add revocation, key rotation, rate limiting, and audit administration.
10. Add Redis-backed routing before running more than one application replica.

## Required tests

- Valid registration and token issuance
- Expired, future, malformed, and wrong-audience assertions
- Signature made by an unregistered or revoked key
- Assertion replay using the same `jti`
- Invitation replay and concurrent invitation consumption
- Cross-tenant canvas access
- Missing read, write, and admin scopes
- Revocation while an MCP session is active
- Browser ticket replay and wrong-canvas use
- Multiple replicas routing to the correct canvas connection
- Logs do not contain credential material

## Open decisions

- Which local MCP clients support OAuth client credentials with `private_key_jwt` directly
- Whether the Blitz setup utility should own the private key or integrate with each client's credential store
- Whether access tokens remain JWTs or become opaque tokens with introspection
- Tenant administration and invitation issuance UX
- Retention period for audit events

