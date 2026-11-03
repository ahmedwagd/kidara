import type { Plugin } from "@opencode-ai/plugin"

// Runs typecheck, lint and tests when a session goes idle and the working tree has changes.
// Agents give opinions; this gives evidence.
// SETUP: replace <pm> below with your package manager command (for example "pnpm").

const COMMANDS = ["<pm> typecheck", "<pm> lint", "<pm> test"]

export const VerifyOnIdle: Plugin = async ({ $, client }) => {
  let running = false

  const log = (level: "info" | "warn" | "error", message: string) =>
    client.app.log({ body: { service: "verify-on-idle", level, message } })

  return {
    event: async ({ event }) => {
      if (event.type !== "session.idle" || running) return
      running = true
      try {
        const changes = (await $`git status --porcelain`.quiet().nothrow().text()).trim()
        if (!changes) return

        if (COMMANDS.some((c) => c.includes("<pm>"))) {
          await log("warn", "Replace <pm> in .opencode/plugin/verify-on-idle.ts before this check can run.")
          return
        }

        for (const cmd of COMMANDS) {
          const result = await $`sh -c ${cmd}`.quiet().nothrow()
          if (result.exitCode !== 0) {
            const tail = result.stderr.toString().split("\n").slice(-15).join("\n")
            await log("error", `FAILED: ${cmd}\n${tail}`)
            return
          }
        }
        await log("info", "typecheck, lint and tests passed")
      } catch (err) {
        await log("error", `verify-on-idle crashed: ${String(err)}`)
      } finally {
        running = false
      }
    },
  }
}