import { Plugin } from "@opencode/plugin"
import { spawn } from "node:child_process"

// Runs typecheck, lint and tests when a session goes idle and the working tree has changes.
// Agents give opinions; this gives evidence. Written for the OpenCode V2 plugin API.
// Requires root npm scripts: "typecheck", "lint", "test" (defined in Phase 1).

const COMMANDS = ["npm run typecheck", "npm run lint", "npm test"]
const TIMEOUT_MS = 10 * 60 * 1000

type Result = { code: number | null; output: string; timedOut: boolean }

// shell: true is needed on Windows (npm is npm.cmd). Commands are fixed strings, never user input.
function run(command: string): Promise<Result> {
  return new Promise((resolve) => {
    const child = spawn(command, { shell: true, cwd: process.cwd() })
    let output = ""
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, TIMEOUT_MS)
    child.stdout?.on("data", (d) => (output += d.toString()))
    child.stderr?.on("data", (d) => (output += d.toString()))
    child.on("error", (err) => {
      clearTimeout(timer)
      resolve({ code: 1, output: String(err), timedOut })
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      resolve({ code, output, timedOut })
    })
  })
}

const tail = (text: string, lines = 15) => text.trim().split("\n").slice(-lines).join("\n")

async function verify() {
  const status = await run("git status --porcelain")
  if (status.code !== 0 || status.output.trim() === "") return

  for (const command of COMMANDS) {
    const result = await run(command)
    if (result.timedOut) {
      console.error(`[verify-on-idle] TIMEOUT: ${command}`)
      return
    }
    if (result.code !== 0) {
      if (/missing script/i.test(result.output)) {
        console.warn(`[verify-on-idle] skipped "${command}": script not defined yet`)
        continue
      }
      console.error(`[verify-on-idle] FAILED: ${command}\n${tail(result.output)}`)
      return
    }
  }
  console.log("[verify-on-idle] typecheck, lint and tests passed")
}

export default Plugin.define({
  id: "verify-on-idle",
  setup(ctx) {
    const controller = new AbortController()
    let running = false

    void (async () => {
      for await (const _event of ctx.event.subscribe({
        types: ["session.idle"],
        signal: controller.signal,
      })) {
        if (running) continue
        running = true
        try {
          await verify()
        } catch (err) {
          console.error(`[verify-on-idle] crashed: ${String(err)}`)
        } finally {
          running = false
        }
      }
    })()

    return () => controller.abort()
  },
})