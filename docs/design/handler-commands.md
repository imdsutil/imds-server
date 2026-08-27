# Handler Commands

## Overview

Handlers are external commands (scripts, binaries, whatever) that the server
calls to generate responses for IMDS requests. The server doesn't care what
language they're written in. It calls them as subprocesses and reads their
output.

The goal is the lowest possible barrier to writing a handler. A working handler
can be a three-line bash script.

## Request Types

Handlers are registered against IMDS request types, not raw paths. Examples:

- `credentials` - IAM/role credential requests
- `region` - instance region/availability zone
- `instance-id` - instance identity
- `hostname` - instance hostname
- etc.

The server maps incoming IMDS paths to these types internally.

## Handler Chain

Multiple handlers can be registered for the same request type. When a request
comes in:

1. Server looks up handlers registered for that request type
2. Calls them sequentially in registration order
3. First handler that returns a response wins
4. Remaining handlers are not called

This is similar to Express middleware. A handler either handles the request or
passes.

## Contract

### Input

The server calls the handler command with arguments. Details TBD, but the
handler receives at minimum:

- The IMDS request path
- Container identity info (id, name, labels)

Example:

```bash
my-handler --path /latest/meta-data/iam/security-credentials/my-role \
           --container-id abc123 \
           --container-name my-app \
           --container-labels '{"imds.aws.role":"arn:aws:iam::123456:role/dev"}'
```

stdin piping may be added later for handlers that need to receive larger
payloads.

### Output

Handlers write their response to stdout. The server treats stdout as the
response body and sends it directly to the client.

The server sets content-type based on the request type (e.g. `application/json`
for credentials, `text/plain` for simple values). Handlers don't need to worry
about headers or HTTP semantics.

### Exit Codes

- `0` - handled. stdout is the response body.
- `1` - not mine. server moves to the next handler in the chain.
- `2` - error. server stops the chain and returns 500.

Those three are the whole contract for a simple handler. A handler that talks to
a remote service can be more specific about _why_ it failed, which lets the
server respond differently:

- `3` - retry. transient (throttled, network blip). server returns 503, the
  status AWS SDKs already back off and retry on.
- `4` - needs attention. a human must act (expired SSO session, MFA prompt)
  before this can ever succeed. server logs the remediation from stderr and
  returns 404, so the client's credential chain moves on cleanly instead of
  hanging for someone who isn't watching.

Anything other than `1` ends the chain: a handler that claims a request has
spoken for it. Unrecognised exit codes are treated as `2`.

Write `3` or `4` only when you mean them. `2` is the safe default — retrying a
malformed role ARN forever buries the real error, and answering 503 to something
permanent turns a clear failure into a slow one.

### Timeout

Handlers have a configurable timeout (default 5 seconds, max 30 seconds). If a
handler doesn't exit in time, the server kills it and treats it as exit code 2.
A timeout is not automatically transient: the server can't tell a slow network
from a handler waiting on a person, so it makes no assumption on the handler's
behalf. A handler that knows it hit a transient limit should catch that itself
and exit `3` before the timeout fires.

## Container Labels

For built-in handlers, the label convention is `imds.*`. The server and proxy
don't prescribe label names beyond `imds-proxy.enabled` (which is a proxy-side
concern, not a server concern).

For role/identity mapping, built-in handlers namespace the label by provider:
`imds.<provider>.role`. The concept is the same across clouds ("assume this
identity for this container"), but each provider gets its own label so a
container can opt in to more than one handler without collision.

```bash
# AWS
docker run --label imds.aws.role=arn:aws:iam::123456:role/my-role ...

# GCP
docker run --label imds.gcp.role=my-sa@project.iam.gserviceaccount.com ...

# Azure
docker run --label imds.azure.role=/subscriptions/.../my-identity ...
```

Custom handlers can use whatever labels they want. The full label set is passed
through as JSON.

## Built-in Handlers

The project will ship working handler implementations for common use cases:

- **AWS STS** - AssumeRole using `imds.aws.role` label value, returns IMDS
  credential format
- **GCP** - Service account token exchange
- **Azure** - Managed identity token acquisition

These serve as both useful defaults and reference implementations for custom
handler authors.

## Handler Discovery

Initially, handlers are configured explicitly in the server config (path to
the command on the local filesystem).

Auto-fetching handlers from remote repos is a future consideration with
significant trust/security implications. Not in scope for initial
implementation.

## Example: Minimal Bash Handler

```bash
#!/usr/bin/env bash
# my-creds-handler.sh - returns fake creds for any request

echo '{
  "Code": "Success",
  "AccessKeyId": "AKIAIOSFODNN7EXAMPLE",
  "SecretAccessKey": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  "Token": "FwoGZXIvYXdzEA...",
  "Expiration": "2026-01-01T00:00:00Z"
}'
```

That's a working credentials handler. `chmod +x`, point the config at it, done.

## Example: Handler That Passes

```bash
#!/usr/bin/env bash
# only-handles-prod-role.sh

LABELS="$4"  # container-labels arg
ROLE=$(echo "$LABELS" | jq -r '.["imds.aws.role"]')

if [ "$ROLE" != "arn:aws:iam::123456:role/prod" ]; then
  exit 1  # not mine
fi

# ... fetch real creds for this role ...
```
