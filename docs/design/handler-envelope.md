# Handler response envelope

Status: accepted. Resolves §2 of `handler-state-ownership.md`. Amends the
Output section of `handler-commands.md`.

## Why

A handler currently writes its answer to stdout and the server relays those
bytes untouched. That keeps handlers trivial, and it means the server knows
nothing _about_ the answer — not when the credentials expire, not whether a
failure is worth retrying, not what a person would have to do to fix it.

Every stateful concern the server is taking on (`handler-state-ownership.md` §1)
needs at least one of those facts. So the handler has to be able to say
something about its answer, not just produce it.

Note what this is _not_ for. The envelope does not carry a type or schema
declaration, because the server already resolved the request type from the path
before it spawned the handler, and dispatched to a handler registered for that
type. A handler announcing its own kind would be repeating what the server told
it, and creating a third way for the two to disagree.

## The envelope

On exit `0`, stdout is a single JSON object. This is a `credentials` response —
the canonical form, which the server renders into the shape the requested
endpoint uses:

```json
{
  "v": 1,
  "body": {
    "accessKeyId": "ASIA...",
    "secretAccessKey": "...",
    "sessionToken": "..."
  },
  "expiresAt": "2026-08-27T18:00:00Z",
  "cacheKey": "aws:111122223333:role/billing"
}
```

On a non-zero exit, stdout is the same object without `body`:

```json
{ "v": 1, "retryAfter": 30 }
```

```json
{
  "v": 1,
  "remediation": "aws sso login --profile acme-dev",
  "authScope": "sso:acme.awsapps.com/start"
}
```

## Fields

| Field         | Type           | When     | Meaning                                                      |
| ------------- | -------------- | -------- | ------------------------------------------------------------ |
| `v`           | integer        | always   | Envelope version. Currently `1`.                             |
| `body`        | object\|string | exit `0` | The response the client receives.                            |
| `expiresAt`   | string         | optional | RFC 3339. When `body` stops being valid.                     |
| `cacheKey`    | string         | optional | Opaque. Two requests with the same key may share a response. |
| `retryAfter`  | number         | exit `3` | Seconds to wait. Advisory; the server may clamp it.          |
| `remediation` | string         | exit `4` | What a human should run or do.                               |
| `authScope`   | string         | exit `4` | Opaque. Identifies the thing being unblocked.                |

Unknown fields are ignored, so a later version can add them without a bump.

### `body`

An object is serialised by the server; a string is sent verbatim.

What `body` is expected to contain is fixed by the request type, not declared in
the envelope. Each request type documents its own body contract, and the handler
registered for that type is held to it.

For most types the contract is "whatever the client should receive" and the
server is a passthrough: `instance-id` returns the id as a string, and the
server sets the content type from the request type as it already does.

`credentials` is the type where this earns something. AWS serves one underlying
credential at more than one endpoint in more than one shape — the EC2 IMDS
format at `/latest/meta-data/iam/security-credentials/<role>`, the ECS format at
`/v2/credentials`. Both resolve to request type `credentials`. If the handler
returns a canonical credential, the server renders whichever shape the requested
path calls for and one handler covers every credential endpoint, present and
future. If the handler returned a pre-rendered body instead, it would be locked
to the endpoint it happened to write for.

Expiry stays on the envelope in exactly one place. The canonical credential does
not repeat it: the server renders `expiresAt` into whatever field the target
format uses — `Expiration` for the EC2 shape — so the value the cache reasons
about and the value the client is told are the same value by construction. A
hand-rendered body would have carried it twice, with nothing keeping the two in
agreement.

### `expiresAt` and `cacheKey`

Both are optional and independent. Without `expiresAt` the response is not
cached. Without `cacheKey` it is cached against the request alone.

`cacheKey` exists because only the handler knows what actually determined its
answer. Two containers with different names and labels may resolve to the same
role and be able to share one credential; the server cannot know that, and the
handler cannot deduplicate. So the handler names the equivalence and the server
enforces it. Per `handler-state-ownership.md` §5, the AWS handler's key is per
role binding, not per container.

### `authScope`

One SSO login unblocks every role in that instance. Ten containers spanning six
roles must produce one browser tab, not six. Deduplicating on the resolved
identity produces six; deduplicating on the auth scope produces one.

Only the handler knows the scope and only the server sees the concurrency, which
is why this crosses the boundary as its own field rather than being inferred.

## What the exit code still does

Exit codes remain authoritative for control flow. The envelope carries detail
about an outcome; it does not declare the outcome.

This deviates from the sketch in `handler-state-ownership.md` §2a, which had a
`status` field. Two sources of truth for the same fact is a bug waiting to
happen — a handler exiting `3` with `"status": "ok"` has no correct
interpretation. The exit code wins because it is the one the server cannot
misparse.

A malformed envelope on exit `0` is an error: the server has no body to send and
must not invent one. A malformed envelope on exit `3` or `4` is not — the exit
code already carries the outcome, so the server proceeds without the detail and
logs that it was unreadable.

## Cost

The trivial handler now wraps its output:

```bash
#!/usr/bin/env bash
printf '{"v":1,"body":%s}' "$(fetch-creds)"
```

Four lines instead of three. That is the whole price for handlers that don't
care about caching, and it buys a uniform contract for the ones that do.

A handler for a passthrough type is no worse off:

```bash
#!/usr/bin/env bash
printf '{"v":1,"body":"%s"}' "$(cat /etc/machine-id)"
```

## Compatibility

Breaking. Every exit-`0` handler must emit an envelope.

No handler outside this repository exists, and `@imdsutil/imds-server` is
unpublished, so the change costs nothing today and cannot be made cheaply after
publish. That asymmetry is the reason to do it now rather than when the cache
needs it.

Deliberately not adopted: accepting either a bare body or an envelope by
detecting which one arrived. It reintroduces guessing at the exact boundary this
document exists to remove, and it would have to be supported indefinitely.
