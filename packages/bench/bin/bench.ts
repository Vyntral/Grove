#!/usr/bin/env bun
import { startBench } from '../src/server.ts'
const port = Number(process.env.GROVE_BENCH_PORT ?? 4773) // 'GROV' = G(7) R(?) — 4773 is fine
startBench({ port })
console.log(`grove bench listening on http://localhost:${port}`)
