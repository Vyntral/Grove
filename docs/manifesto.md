# Manifesto

## Agents are processes, not scripts

In 2026 every AI framework treats an agent like a script: a function call, a coroutine, an `await llm()` in a loop. The model returns, you got your answer, you go home. This works for demos and dies in production.

A real agent is a *process*. It runs for minutes, hours, days. It holds state. It calls tools that fail. It hits APIs that go down. It takes inputs from queues, files, humans. It branches, retries, escalates. It coexists with hundreds of other processes that may need to coordinate, fail, restart, or be replaced.

We have known how to build reliable distributed processes for 30 years. The Erlang/OTP discipline — let it crash; supervise; restart with policy; isolate state per process — built telecom systems with five-nines uptime. There is no reason agents shouldn't inherit it.

## Three principles

**One. Let it crash.** Don't try to anticipate every failure inside the agent loop. Let the process die. Supervise it. The supervisor decides whether to restart, restart everything, or escalate. Crashes become information, not bugs to hide.

**Two. Compile what doesn't need to think.** Agents shell out to LLMs for tasks that are not actually creative — formatting, parsing, looking up, transforming. Every such call is wasted money and latency. The compiler should identify deterministic paths and replace them with code. The model is invoked only where reasoning is actually required.

**Three. The recording is the truth.** Production behaviour should be captured by default, not bolted on. Every step should be inspectable: what the model saw, what it produced, which tool it called, what came back, how much it cost, how long it took. The dev should be able to scrub through any past run, edit any step, replay alternate timelines, and ship the change with confidence that nothing else regressed.

## Why now

The model layer has stabilised. Frontier reasoning quality has plateaued; price per token is dropping; long context is solved. The bottleneck has shifted to the *system layer* — the substrate that turns models into reliable products. That layer is currently a pile of LangChain scripts, ad-hoc retry logic, and hopeful try/catches.

Grove is that layer.

## What we are not

- We are **not** another agent framework that wraps `generateText`. We use the AI SDK underneath, like everyone should.
- We are **not** an observability dashboard. The Bench is the cockpit, and recording is automatic, but observability is a *consequence* of the runtime, not the product.
- We are **not** a hosted platform. Grove is an open-source TypeScript library you install. Run it on your laptop, your cloud, your edge, your customer's air-gapped server. Hosting comes later, on top, optional.

## What we measure

A Grove user installs it once and feels three concrete improvements within an afternoon:

1. **An agent crashes in production and recovers without paging a human.**
2. **A previously-expensive workflow drops 10× in cost without changing the model.**
3. **A regression that took an hour to diagnose now takes 90 seconds in the Bench.**

If we deliver those three moments reliably, Grove becomes infrastructure. If we don't, we're noise.
