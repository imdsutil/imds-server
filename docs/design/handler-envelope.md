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
  "imdsEnvelope": 1,
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
{ "imdsEnvelope": 1, "retryAfter": 30 }
```

```json
{
  "imdsEnvelope": 1,
  "remediation": "aws sso login --profile acme-dev",
  "authScope": "sso:acme.awsapps.com/start"
}
```

## The envelope is optional

A handler may write a bare response body instead, exactly as it does today. The
server decides which it received by one test: **with leading whitespace
stripped, does stdout begin with `{`, parse as a JSON object, and carry an
integer `imdsEnvelope` at the top level?** If yes, it is an envelope. If no, it
is a body and is proxied through untouched.

Stripping leading whitespace first is not cosmetic. A handler that pretty-prints
its envelope, or emits a leading newline, would otherwise fail the test and have
its control data relayed to the client as though it were the response — and
because a bare body is a legitimate outcome, nothing would report it. The
`{`-first check is a cheap gate before parsing, not the test itself.

`imdsEnvelope` is an opt-in switch, not a hint. This is not the content sniffing rejected in
`handler-state-ownership.md` §2b, which tried to infer meaning from an arbitrary
credential body. The only thing inferred here is whether the handler chose to
speak the richer protocol, and it says so with a marker it deliberately wrote.

### The marker

`imdsEnvelope` does two jobs in one field: its presence declares the object an
envelope, and its value is the format version.

The name is deliberately specific to this project. A generic key would put the
weight of avoiding collisions on how unlikely the collision seemed, which is a
bet that gets worse as more request types are added and as handlers proxy
content the server did not author. `imdsEnvelope` appearing by accident in a
metadata body is not a risk worth reasoning about further.

### Once the marker is present, it binds

An envelope that fails validation is an error. The server does not fall back to
proxying it as a body.

This is the rule that makes optionality safe. Without it, a handler that meant
to send an envelope and got the JSON slightly wrong would have its control data
silently relayed to the client as though it were credentials — the worst
available outcome, and one that would surface as a confusing client error far
from its cause. Present-but-invalid is a bug, and it is reported as one.

### Detection runs per request type

A request type whose body is arbitrary content does not participate in envelope
detection at all. Its stdout is a body, unconditionally.

Nothing mapped today is in that category, and no current type collides: the two
that return JSON objects are `credentials` and `instance-identity`, and neither
carries anything resembling the marker.

An earlier draft named the marker `v`, which made the identity document a near
miss — it carries `"version": "2017-09-30"`, one rename away from a collision.
That margin is why the marker is namespaced now rather than short.

The category exists for what comes next. `/latest/user-data` is the obvious
candidate: its body is whatever the user supplied, and the server has no
standing to interpret it at all. A namespaced marker makes an accidental
collision far-fetched, but "far-fetched" is the wrong standard for content the
server does not control, and the cost of being wrong is handing a user's own
data back to them mangled. Such types opt out of detection outright; the marker
is defence in depth, not the guard.

### Some request types want an envelope

Whether an envelope buys anything is a property of the request type, which the
server already knows before it spawns the handler.

`instance-id` returns `i-1234567890abcdef0`. There is nothing to cache and one
possible rendering; wrapping it is ceremony. Bare bodies are the expected form
and the server says nothing.

`credentials` is different. Without an envelope the server has no expiry, so it
cannot cache, and no canonical form, so it cannot serve both the EC2 and ECS
shapes from one handler. The response still works — it is proxied through, and a
handler that only targets one endpoint is fine forever. But the server logs a
warning naming the handler and what it is giving up, once per handler and
request type rather than per request, because the same handler will answer every
credential fetch for the lifetime of the process.

## Fields

| Field          | Type           | When     | Meaning                                                                      |
| -------------- | -------------- | -------- | ---------------------------------------------------------------------------- |
| `imdsEnvelope` | integer        | always   | Marks the object as an envelope; value is the format version. Currently `1`. |
| `body`         | object\|string | exit `0` | The response the client receives.                                            |
| `expiresAt`    | string         | optional | RFC 3339. When `body` stops being valid.                                     |
| `cacheKey`     | string         | optional | Opaque. Two requests with the same key may share a response.                 |
| `retryAfter`   | number         | exit `3` | Seconds to wait. Advisory; the server may clamp it.                          |
| `remediation`  | string         | exit `4` | What a human should run or do.                                               |
| `authScope`    | string         | exit `4` | Opaque. Identifies the thing being unblocked.                                |

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

A handler that wants what the envelope offers wraps its output:

```bash
#!/usr/bin/env bash
printf '{"imdsEnvelope":1,"body":%s}' "$(fetch-creds)"
```

Four lines instead of three, and only for handlers that want caching or
multi-endpoint rendering. A handler that wants neither writes what it always
wrote:

```bash
#!/usr/bin/env bash
fetch-creds
```

## Compatibility

Not breaking. Every handler that works today keeps working, including the
fixture in `test/fixtures/`, and gains a warning at most.

An earlier draft of this document made the envelope mandatory and leaned on the
package being unpublished to justify the cost. That argument was sound and is no
longer needed: a handler adopts the envelope when it wants something the
envelope provides, and the three-line bash script that
`handler-commands.md` promises stays three lines.

The server carries two input paths permanently as a result. That is the price,
and it is worth paying — the alternative taxes every trivial handler forever to
spare the server one branch.
