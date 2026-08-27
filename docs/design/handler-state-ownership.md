# Handler state ownership

Status: proposal. Amends `handler-commands.md` and `handler-aws.md`.

## Overview

`handler-commands.md` commits to an extension model whose stated goal is the
lowest possible barrier to entry: "a working handler can be a three-line bash
script." `handler-aws.md` then places a credential cache inside the AWS handler,
at `~/.cache/imds-handler-aws/`.

Those two decisions are in conflict. This note argues that the conflict resolves
in favour of the protocol — the extension model is sound — and that the cache
must move to the server. It then works through what that implies for the
protocol, because the current contract cannot support a server-side cache
without changing.

## The principle

A handler is spawned per request, answers one question, and exits. It sees a
single request. It never sees the request _stream_.

Caching, in-flight deduplication, background refresh, and rate limiting are all
properties of a request stream. None of them can be implemented correctly by a
process that observes one request in isolation.

> **A handler is a pure function from container context to credentials. Every
> stateful concern belongs to the server.**

This is not a constraint the protocol imposes reluctantly. It is what makes the
three-line bash script viable: the script has no state to manage because state
was never its job.

## 1. The credential cache belongs to the server

`handler-aws.md` specifies a file-backed cache keyed on role ARN + profile +
caller identity, living in `~/.cache/imds-handler-aws/`. The key design is
right. The location is not.

**The pluggability argument.** If the cache lives in the handler, then every
handler needs one. A GCP handler, an Azure handler, and a corporate-internal
handler each have to implement TTL handling, single-flight, stale-while-
revalidate, and negative caching — independently, in whatever language they were
written in. The three-line bash script cannot do any of it. The barrier to entry
we advertise is not the barrier we would actually be imposing.

**The correctness argument.** A per-request process cannot deduplicate against
its own siblings. Twelve containers starting together spawn twelve handler
processes; nothing in that picture can collapse them into one `AssumeRole` call,
because no participant knows the others exist. The usual fix is a lock file, at
which point we have a distributed-systems problem in a directory, with stale
locks surviving `SIGKILL` as the reward.

**The uniformity argument.** One cache in the server means one implementation to
get right, one place to audit for credential leakage, one place to instrument,
and consistent `imds-server` status output across every handler regardless of who
wrote it.

**Proposed change.** Remove `cache.js` from the handler package structure in
`handler-aws.md`. Move the credential cache into the server, applying uniformly
to every handler in the chain. The handler keeps whatever internal caching its
own dependencies do — the AWS SDK's SSO token cache on disk, for instance — which
is invisible to the server and none of its business.

## 2. A server-side cache requires the server to read the expiry

This is the part that costs something, and it should be decided deliberately
rather than waved through.

`handler-commands.md` currently says:

> The server treats stdout as the response body and sends it directly to the
> client.

An opaque byte stream cannot be cached. The server has no way to learn when the
credentials it just relayed expire, so it cannot decide when to evict, when to
refresh early, or whether what it holds is still safe to serve. Server-side
caching is impossible under the current contract, whatever we do elsewhere.

Three ways out:

**(a) A response envelope.** The handler returns structured JSON that the server
unwraps and renders:

```json
{
  "version": 1,
  "status": "ok",
  "credentials": {
    "access_key_id": "ASIA...",
    "secret_access_key": "...",
    "session_token": "...",
    "expiration": "2026-08-23T18:00:00Z"
  },
  "identity": { "account": "111122223333", "region": "eu-west-1" },
  "cache": { "key": "aws:1111:role/billing:acme-dev" }
}
```

Cleanest, and it has a second benefit: rendering moves to the server, so a
handler for a provider whose wire format is not AWS-shaped — a GCP handler
returning a bearer token — stops having to pretend. The cost is that the trivial
handler now emits an envelope rather than the literal response body, and
`format.js` moves from the AWS handler into the server.

**(b) Content-type-aware sniffing.** The server already knows the request type is
`credentials`, so it could parse the IMDS credential JSON it receives and read
`Expiration`. No protocol change; handlers stay unchanged. The cost is that the
server acquires per-request-type parsing of formats it currently treats as
opaque, and the "handlers own their response body" property quietly dies anyway
— less visibly, and only for the types we special-case.

**(c) Sidecar metadata.** Body on stdout as today, cache metadata on fd 3 or as a
trailing line. Preserves the current contract for simple handlers and is
opt-in. It is also the fiddliest to specify and the easiest to get wrong in a
shell script.

**Recommendation: (a).** It is the only option that stays honest about what the
server is doing, and the multi-cloud rendering benefit is real given the stated
intent to ship GCP and Azure handlers. But it is a breaking protocol change, and
it is the decision in this note I hold most loosely. (b) is a legitimate
near-term compromise if we want caching before we want a stable third-party
contract.

_Amended by §6: (b) turns out not to be viable for the failure paths at all._

_**Resolved: (a).** Specified in `handler-envelope.md`. The accepted spec drops
the `status` field sketched above — exit codes stay authoritative for control
flow and the envelope carries only detail, so the two cannot disagree._

## 3. The status vocabulary is too narrow

Current contract:

- `0` — handled, stdout is the response body
- `1` — not mine, try the next handler
- `2` — error, stop the chain and return 500

The `0`/`1` split is good and should be kept. Distinguishing "not mine" from
"broken" lets the server render "no role attached" — indistinguishable from an
EC2 instance with no instance profile, so the SDK chain proceeds normally —
separately from a genuine failure. It is worth stating explicitly that this was
the right call.

`2` is doing too much. It currently collapses three situations with completely
different correct responses:

| Situation                                   | Correct server behaviour              | Today |
| ------------------------------------------- | ------------------------------------- | ----- |
| Config is broken (bad ARN, unknown profile) | Surface loudly, never retry           | `2`   |
| Transient (STS throttle, network)           | Back off and retry                    | `2`   |
| A human must act (SSO expired, MFA)         | Enter an attention flow, do not retry | `2`   |

Retrying a malformed ARN forever generates noise that buries the real message.
Not retrying a throttle turns a blip into an outage. Retrying an expired SSO
session spawns a browser tab per attempt.

**Proposed additions**, leaving `0` and `1` untouched:

- `2` — error. Permanent for this request as posed. Do not retry.
- `3` — retry. Transient; back off and retry within budget.
- `4` — needs attention. A human must act; do not retry blindly.

`3` and `4` want structured detail (a retry-after hint; a remediation command, an
auth scope, a device code), which is another argument for the envelope in §2.

Adding codes to a protocol with one implementation is nearly free. Doing it once
third-party handlers exist is a breaking change. This is worth doing now even if
§2 is deferred.

## 4. Interactive re-auth cannot block the request

`handler-aws.md` specifies that `autoSsoLogin` spawns `aws sso login` and "blocks
until the user approves in the browser", with a note to raise the handler timeout
to 120000ms.

This addresses the wrong side of the transaction. AWS SDKs give IMDS roughly one
second with a small retry budget; several mark the endpoint unavailable for the
remaining process lifetime after repeated failure. A 120-second handler timeout
does not buy patience — the SDK gave up 119 seconds earlier, and a long-running
container may now refuse to try IMDS again until it restarts. The developer
experiences a hang followed by a failure, which is strictly less informative than
an immediate clean "no role" response plus a desktop notification.

Two changes follow:

**Fail fast, remediate out of band.** The handler returns "needs attention" with
the command to run. The server holds the request only briefly — short enough to
stay inside the SDK's read timeout, so a fast remediation can still be served
inline — then answers. Remediation runs in the background; the SDK's own retry
picks up the result once the cache is warm.

**Deduplicate logins on auth scope, not on identity.** One SSO login unblocks
every role in that SSO instance. Ten containers spanning six roles must produce
exactly one browser tab. Keying deduplication on the resolved identity produces
six. Only the handler knows the scope, and only the server sees the concurrency,
so the scope has to cross the protocol boundary as a field.

Under the current subprocess model with `autoSsoLogin` as specified, twelve
containers starting together spawn twelve `aws sso login` processes. Nothing in
the protocol prevents it today.

## 5. Session naming and cache keys interact

A concrete trap, worth recording because it is easy to walk into twice.

`handler-aws.md` sets the default session name to
`imds-server-{container-name}` — per container. It keys the cache on role ARN +
profile + caller identity — per role. Both cannot hold:

- If the session name is part of the cache key, twelve replicas of one service
  produce twelve `AssumeRole` calls and the cache does nothing for the burst case
  it exists to solve.
- If it is not, cached credentials get served to containers under a session name
  minted for a different container, and CloudTrail attribution is quietly wrong.

Pick one, explicitly:

- **Per-binding session names** (`imds-server-{role}` or similar) preserve
  coalescing and make CloudTrail honest at the granularity of "this laptop, this
  role". On a single-developer machine, the containers being collapsed are the
  same human doing the same work.
- **Per-container session names** keep finer attribution and accept one STS call
  per container.

The default should be per-binding, with per-container available as a
configuration option and the cache cost documented at the config site. Whichever
we choose, the choice determines the cache key, so it should be settled before
the cache is implemented.

**Settled: per-binding.** `handler-aws.md` now defaults `sessionName` to
`imds-server-{role-name}` and documents `{container-name}` as the opt-in for
per-container attribution, with the coalescing cost stated at the config site.
The cache key in §1 can be built on the assumption that containers sharing a
role share a credential.

## 6. Implementing §3 showed that sniffing cannot carry the detail

§3 has since landed. Doing it surfaced an argument against option (b) that this
note did not have when it was written, and it is the strongest one available.

Option (b) reads the expiry out of the response body. Exit codes `3` and `4`
have no response body. A handler that is being throttled, or that needs an SSO
login, produced no credentials to render — that is the entire point of the
status. There is nothing on stdout to sniff.

So the two paths do not merely differ in cleanliness. Sniffing works on the
success path only, and every piece of structured detail this note asks for on
the failure paths — the retry-after hint in §3, the remediation command and the
auth scope in §4 — has no channel under (b) at all.

The implementation made the gap concrete by working around it. Needs-attention
currently logs the handler's stderr as the remediation string, because stderr is
the only thing crossing the boundary on a failure. That is serviceable for a
human reading logs and useless for anything else: it is untyped free text, and
§4's deduplication has to key on the auth scope. Keying dedup on a substring of
stderr is not a design anyone would defend.

This does not resolve the fork by itself — (c), the sidecar, still carries
failure-path metadata, and it was set aside for fiddliness rather than
incapacity. But it does remove (b) from contention for anything beyond a
success-path cache. If the SSO story in §4 is wanted, the choice is (a) or (c),
and (a) is the one that also solves multi-cloud rendering.

**Revised recommendation:** (a), now held considerably less loosely. (b) remains
viable only if the scope is narrowed to caching successful credential responses
and §4 is abandoned or deferred indefinitely.

## What this note does not decide

- ~~Whether to adopt the envelope (§2a) or the sidecar (§2c).~~ Settled: the
  envelope, specified in `handler-envelope.md`.
- Whether the server should pre-warm credentials at container start rather than
  waiting for the first request. Container boot time is the only window in the
  system wide enough to hold a human, which makes it attractive for the SSO case,
  but it spends STS quota on containers that may never make an AWS call.
- Request delivery. `handler-commands.md` already anticipates stdin for larger
  payloads; if the envelope lands, symmetric JSON-in/JSON-out is worth
  considering over the current flags.
- A conformance harness. If a three-line bash script is a supported extension
  point, an `imds-server verify-handler ./my-handler` command is what keeps that
  promise honest — a prose contract is one every implementer misreads
  differently.

## Compatibility

§3 (status codes) is additive and safe to land immediately: existing handlers
returning `0`, `1`, or `2` keep working unchanged. This has landed.

§1 (cache location) touches no protocol surface — it removes planned handler
functionality and adds server functionality. §5 is settled, so its key is
determined.

§2 (envelope) is breaking and should be versioned. Since `@imdsutil/imds-handler-aws`
is the only handler in existence and is not yet published, the window for making
it cheaply is now. Accepted and specified in `handler-envelope.md`; the `v` field
carries the version.
